import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { PaymentAttemptRepository, UpdatePaymentAttemptSnapshot } from "../application/payment-attempt-repository";
import type { PaymentAttempt, PaymentProvider } from "../domain/payment";

type PaymentAttemptRow = Prisma.PaymentAttemptGetPayload<object>;

export class PrismaPaymentAttemptRepository implements PaymentAttemptRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(attempt: PaymentAttempt): Promise<PaymentAttempt> {
    return mapPaymentAttempt(await this.prisma.paymentAttempt.create({ data: attempt }));
  }

  async findById(id: string): Promise<PaymentAttempt | null> {
    const row = await this.prisma.paymentAttempt.findUnique({ where: { id } });
    return row ? mapPaymentAttempt(row) : null;
  }

  async findByProviderResourceId(
    provider: PaymentProvider,
    providerResourceId: string,
  ): Promise<PaymentAttempt | null> {
    const row = await this.prisma.paymentAttempt.findFirst({ where: { provider, providerResourceId } });
    return row ? mapPaymentAttempt(row) : null;
  }

  async listByOrderId(orderId: string): Promise<ReadonlyArray<PaymentAttempt>> {
    const rows = await this.prisma.paymentAttempt.findMany({
      where: { orderId },
      orderBy: [{ attemptNumber: "asc" }, { createdAt: "asc" }],
    });
    return rows.map(mapPaymentAttempt);
  }

  async updateSnapshot(input: UpdatePaymentAttemptSnapshot): Promise<PaymentAttempt> {
    return mapPaymentAttempt(await this.prisma.paymentAttempt.update({
      where: { id: input.id },
      data: {
        status: input.status,
        providerResourceId: input.providerResourceId,
        checkoutUrl: input.checkoutUrl,
        providerStatus: input.providerStatus,
        providerStatusDetail: input.providerStatusDetail,
        approvedAt: input.approvedAt,
        rejectedAt: input.rejectedAt,
        refundedAmountInCents: input.refundedAmountInCents,
      },
    }));
  }
}

export function mapPaymentAttempt(row: PaymentAttemptRow): PaymentAttempt {
  return {
    id: row.id,
    orderId: row.orderId,
    provider: row.provider,
    attemptNumber: row.attemptNumber,
    idempotencyKey: row.idempotencyKey,
    status: row.status,
    amountInCents: row.amountInCents,
    currency: row.currency,
    providerResourceId: row.providerResourceId,
    checkoutUrl: row.checkoutUrl,
    providerStatus: row.providerStatus,
    providerStatusDetail: row.providerStatusDetail,
    approvedAt: row.approvedAt,
    rejectedAt: row.rejectedAt,
    refundedAmountInCents: row.refundedAmountInCents,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
