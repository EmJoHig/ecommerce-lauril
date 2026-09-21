import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { ConflictError } from "@/shared/domain/errors";
import type {
  AcquirePaymentAttemptInput,
  PaymentAttemptRepository,
  UpdatePaymentAttemptSnapshot,
} from "../application/payment-attempt-repository";
import type { PaymentAttempt, PaymentProvider } from "../domain/payment";
import { createPaymentAttempt } from "../domain/payment";

type PaymentAttemptRow = Prisma.PaymentAttemptGetPayload<object>;

export class PrismaPaymentAttemptRepository implements PaymentAttemptRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(attempt: PaymentAttempt): Promise<PaymentAttempt> {
    return mapPaymentAttempt(await this.prisma.paymentAttempt.create({ data: attempt }));
  }

  async acquireActive(input: AcquirePaymentAttemptInput): Promise<PaymentAttempt> {
    for (let retry = 0; retry < 3; retry += 1) {
      const active = await this.findActiveByOrderId(input.orderId);
      if (active) return active;

      const latest = await this.prisma.paymentAttempt.findFirst({
        where: { orderId: input.orderId },
        orderBy: [{ attemptNumber: "desc" }, { createdAt: "desc" }],
        select: { attemptNumber: true, status: true },
      });
      if (latest && !["REJECTED", "CANCELLED", "REFUNDED"].includes(latest.status)) {
        throw new ConflictError("El pedido ya posee un intento de pago que no admite reemplazo.");
      }

      const attempt = createPaymentAttempt({
        orderId: input.orderId,
        provider: input.provider,
        attemptNumber: (latest?.attemptNumber ?? 0) + 1,
        amountInCents: input.amountInCents,
        currency: input.currency,
      }, input.createdAt);
      try {
        return await this.create(attempt);
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        const winner = await this.findActiveByOrderId(input.orderId);
        if (winner) return winner;
      }
    }
    throw new ConflictError("No se pudo reservar un intento de pago activo.");
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

  private async findActiveByOrderId(orderId: string): Promise<PaymentAttempt | null> {
    const row = await this.prisma.paymentAttempt.findFirst({
      where: { orderId, status: { in: ["CREATED", "PENDING"] } },
      orderBy: [{ attemptNumber: "desc" }, { createdAt: "desc" }],
    });
    return row ? mapPaymentAttempt(row) : null;
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

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "P2002";
}
