import type { PrismaClient } from "@/generated/prisma/client";
import { reservationNotReleasedWhere } from "@/modules/orders/infrastructure/prisma-order-filters";
import type {
  PaymentConfirmationOrder,
  PaymentConfirmationTransaction,
  PaymentConfirmationUnitOfWork,
} from "../application/payment-confirmation-unit-of-work";
import { mapPaymentAttempt } from "./prisma-payment-attempt-repository";
import { mapPaymentEvent } from "./prisma-payment-event-repository";
import { mapPaymentRefund } from "./prisma-payment-refund-repository";

type Transaction = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export class PrismaPaymentConfirmationUnitOfWork implements PaymentConfirmationUnitOfWork {
  constructor(private readonly prisma: PrismaClient) {}

  async run<T>(work: (transaction: PaymentConfirmationTransaction) => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction((tx) => work(createTransaction(tx)));
      } catch (error) {
        lastError = error;
        if (!isRetryableTransactionError(error) || attempt === 2) throw error;
      }
    }
    throw lastError;
  }
}

function createTransaction(tx: Transaction): PaymentConfirmationTransaction {
  return {
    findEvent: async (id) => {
      const row = await tx.paymentEvent.findUnique({ where: { id } });
      return row ? mapPaymentEvent(row) : null;
    },
    findAttempt: async (id) => {
      const row = await tx.paymentAttempt.findUnique({ where: { id } });
      return row ? mapPaymentAttempt(row) : null;
    },
    findActiveRefund: async (paymentAttemptId) => {
      const row = await tx.paymentRefund.findFirst({
        where: { paymentAttemptId, status: { in: ["CREATED", "SUBMITTED"] } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      return row ? mapPaymentRefund(row) : null;
    },
    findLateRefundInReview: async (input) => {
      const rows = await tx.paymentRefund.findMany({
        where: { ...input, provider: "MERCADO_PAGO", kind: "FULL", status: "REQUIRES_REVIEW" },
        take: 2,
      });
      // Do not guess which operation to confirm if the correspondence is ambiguous.
      return rows.length === 1 ? mapPaymentRefund(rows[0]!) : null;
    },
    createRefund: async (refund) => {
      await tx.paymentRefund.create({ data: refund });
    },
    updateRefund: async (input) => {
      await tx.paymentRefund.update({
        where: { id: input.id },
        data: {
          status: input.status,
          ...(input.providerRefundId !== undefined ? { providerRefundId: input.providerRefundId } : {}),
          ...(input.providerStatus !== undefined ? { providerStatus: input.providerStatus } : {}),
          ...(input.failureCode !== undefined ? { failureCode: input.failureCode } : {}),
          ...(input.submittedAt !== undefined ? { submittedAt: input.submittedAt } : {}),
          ...(input.confirmedAt !== undefined ? { confirmedAt: input.confirmedAt } : {}),
        },
      });
    },
    findOrder: async (id): Promise<PaymentConfirmationOrder | null> => {
      const row = await tx.order.findUnique({
        where: { id },
        select: {
          id: true,
          number: true,
          status: true,
          currency: true,
          totalInCents: true,
          reservationReleasedAt: true,
          items: {
            select: {
              quantity: true,
              productVariant: {
                select: {
                  inventory: {
                    select: { id: true, stockOnHand: true, stockReserved: true, version: true },
                  },
                },
              },
            },
          },
        },
      });
      if (!row) return null;
      return {
        id: row.id,
        number: row.number,
        status: row.status,
        currency: row.currency,
        totalInCents: row.totalInCents,
        reservationReleasedAt: row.reservationReleasedAt,
        items: row.items.map((item) => ({
          quantity: item.quantity,
          inventory: item.productVariant?.inventory ?? null,
        })),
      };
    },
    updateAttempt: async (input) => {
      await tx.paymentAttempt.update({
        where: { id: input.id },
        data: {
          status: input.status,
          providerStatus: input.providerStatus,
          providerStatusDetail: input.providerStatusDetail,
          approvedAt: input.approvedAt,
          rejectedAt: input.rejectedAt,
          refundedAmountInCents: input.refundedAmountInCents,
        },
      });
    },
    convertInventory: async (input) => {
      const updated = await tx.inventory.updateMany({
        where: { id: input.id, version: input.expectedVersion },
        data: {
          stockOnHand: input.stockOnHand,
          stockReserved: input.stockReserved,
          version: { increment: 1 },
        },
      });
      return updated.count === 1;
    },
    createSaleMovement: async (input) => {
      await tx.inventoryMovement.create({
        data: {
          inventoryId: input.inventoryId,
          type: "SALE",
          quantity: input.quantity,
          stockBefore: input.stockBefore,
          stockAfter: input.stockAfter,
          reason: "Venta confirmada por Mercado Pago",
          referenceType: "ORDER",
          referenceId: input.orderId,
          adminUserId: null,
          createdAt: input.createdAt,
        },
      });
    },
    markOrderPaid: async (orderId, changedAt) => {
      const updated = await tx.order.updateMany({
        where: { id: orderId, status: "PENDING_PAYMENT", ...reservationNotReleasedWhere },
        data: { status: "PAID", updatedAt: changedAt },
      });
      return updated.count === 1;
    },
    createPaidHistory: async (orderId, changedAt) => {
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: "PENDING_PAYMENT",
          toStatus: "PAID",
          actorUserId: null,
          reason: "Pago acreditado por Mercado Pago.",
          createdAt: changedAt,
        },
      });
    },
    transitionOrderRefund: async (input) => {
      const updated = await tx.order.updateMany({
        where: { id: input.orderId, status: input.fromStatus },
        data: { status: input.toStatus, updatedAt: input.changedAt },
      });
      if (updated.count !== 1) return false;
      await tx.orderStatusHistory.create({ data: {
        orderId: input.orderId,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        actorUserId: null,
        reason: input.reason,
        createdAt: input.changedAt,
      } });
      return true;
    },
    finishEvent: async (eventId, attemptId, processedAt) => {
      const updated = await tx.paymentEvent.updateMany({
        where: { id: eventId, processingStatus: { in: ["RECEIVED", "FAILED"] } },
        data: {
          processingStatus: "PROCESSED",
          paymentAttemptId: attemptId,
          processedAt,
        },
      });
      return updated.count === 1;
    },
  };
}

function isRetryableTransactionError(error: unknown): boolean {
  if (!(error instanceof Error) || !("code" in error)) return false;
  return ["P2002", "P2034"].includes(String(error.code));
}
