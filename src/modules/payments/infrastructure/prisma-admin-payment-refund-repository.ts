import type { PrismaClient } from "@/generated/prisma/client";
import { ConflictError } from "@/shared/domain/errors";
import type { AdminPaymentRefundRepository } from "../application/admin-payment-refund-repository";
import type { PaymentRefund } from "../domain/payment-refund";
import { mapPaymentAttempt } from "./prisma-payment-attempt-repository";
import { mapPaymentRefund } from "./prisma-payment-refund-repository";

export class PrismaAdminPaymentRefundRepository implements AdminPaymentRefundRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findRefundablePayment(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true, number: true, status: true, totalInCents: true, currency: true,
        paymentAttempts: {
          where: { status: { in: ["APPROVED", "PARTIALLY_REFUNDED"] } },
          orderBy: [{ attemptNumber: "desc" }, { createdAt: "desc" }],
          take: 1,
        },
      },
    });
    const attempt = order?.paymentAttempts[0];
    return order && attempt ? {
      orderId: order.id,
      orderNumber: order.number,
      orderStatus: order.status,
      totalInCents: order.totalInCents,
      currency: order.currency,
      attempt: mapPaymentAttempt(attempt),
    } : null;
  }

  async acquireWithAudit(refund: PaymentRefund, orderId: string, actorUserId: string): Promise<PaymentRefund> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const active = await tx.paymentRefund.findFirst({
          where: { paymentAttemptId: refund.paymentAttemptId, status: { in: ["CREATED", "SUBMITTED"] } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        });
        if (active) return mapPaymentRefund(active);
        const created = await tx.paymentRefund.create({ data: refund });
        await tx.auditLog.create({ data: {
          actorUserId,
          action: "payment.refund_request",
          entityType: "Order",
          entityId: orderId,
          metadata: { kind: refund.kind, amountInCents: refund.amountInCents.toString() },
          createdAt: refund.createdAt,
        } });
        return mapPaymentRefund(created);
      });
    } catch (error) {
      if (error instanceof Error && "code" in error && ["P2002", "P2034"].includes(String(error.code))) {
        const active = await this.prisma.paymentRefund.findFirst({
          where: { paymentAttemptId: refund.paymentAttemptId, status: { in: ["CREATED", "SUBMITTED"] } },
        });
        if (active) return mapPaymentRefund(active);
        throw new ConflictError("La solicitud de reembolso coincidió con otra operación.");
      }
      throw error;
    }
  }
}
