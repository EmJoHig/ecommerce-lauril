import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { ConflictError } from "@/shared/domain/errors";
import type { PaymentRefundRepository } from "../application/payment-refund-repository";
import type { PaymentRefund } from "../domain/payment-refund";

type PaymentRefundRow = Prisma.PaymentRefundGetPayload<object>;

export class PrismaPaymentRefundRepository implements PaymentRefundRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async acquireActive(refund: PaymentRefund): Promise<PaymentRefund> {
    const active = await this.findActiveByAttemptId(refund.paymentAttemptId);
    if (active) return active;
    try {
      return mapPaymentRefund(await this.prisma.paymentRefund.create({ data: refund }));
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const winner = await this.findActiveByAttemptId(refund.paymentAttemptId);
      if (winner) return winner;
      throw new ConflictError("No se pudo reservar la solicitud de reembolso.");
    }
  }

  async findActiveByAttemptId(paymentAttemptId: string): Promise<PaymentRefund | null> {
    const row = await this.prisma.paymentRefund.findFirst({
      where: { paymentAttemptId, status: { in: ["CREATED", "SUBMITTED"] } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return row ? mapPaymentRefund(row) : null;
  }

  async updateStatus(input: Parameters<PaymentRefundRepository["updateStatus"]>[0]): Promise<PaymentRefund> {
    return mapPaymentRefund(await this.prisma.paymentRefund.update({
      where: { id: input.id },
      data: {
        status: input.status,
        ...(input.providerRefundId !== undefined ? { providerRefundId: input.providerRefundId } : {}),
        ...(input.providerStatus !== undefined ? { providerStatus: input.providerStatus } : {}),
        ...(input.failureCode !== undefined ? { failureCode: input.failureCode } : {}),
        ...(input.submittedAt !== undefined ? { submittedAt: input.submittedAt } : {}),
        ...(input.confirmedAt !== undefined ? { confirmedAt: input.confirmedAt } : {}),
      },
    }));
  }
}

export function mapPaymentRefund(row: PaymentRefundRow): PaymentRefund {
  return { ...row };
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "P2002";
}
