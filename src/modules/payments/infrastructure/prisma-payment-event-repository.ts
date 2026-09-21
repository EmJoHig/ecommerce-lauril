import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { PaymentEventRepository, PersistPaymentEventResult } from "../application/payment-event-repository";
import type { PaymentEvent, PaymentEventProcessingStatus, PaymentProvider } from "../domain/payment";

type PaymentEventRow = Prisma.PaymentEventGetPayload<object>;

export class PrismaPaymentEventRepository implements PaymentEventRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async persistIfAbsent(event: PaymentEvent): Promise<PersistPaymentEventResult> {
    try {
      return {
        event: mapPaymentEvent(await this.prisma.paymentEvent.create({ data: event })),
        created: true,
      };
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const existing = await this.findByProviderEventId(event.provider, event.providerEventId);
      if (!existing) throw error;
      return { event: existing, created: false };
    }
  }

  async findByProviderEventId(
    provider: PaymentProvider,
    providerEventId: string,
  ): Promise<PaymentEvent | null> {
    const row = await this.prisma.paymentEvent.findUnique({
      where: { provider_providerEventId: { provider, providerEventId } },
    });
    return row ? mapPaymentEvent(row) : null;
  }

  async finishIfPending(input: Readonly<{
    id: string;
    processingStatus: PaymentEventProcessingStatus;
    processedAt: Date | null;
    paymentAttemptId: string | null;
  }>): Promise<PaymentEvent | null> {
    const updated = await this.prisma.paymentEvent.updateMany({
      where: { id: input.id, processingStatus: { in: ["RECEIVED", "FAILED"] } },
      data: {
        processingStatus: input.processingStatus,
        processedAt: input.processedAt,
        paymentAttemptId: input.paymentAttemptId,
      },
    });
    if (updated.count !== 1) return null;
    const event = await this.prisma.paymentEvent.findUnique({ where: { id: input.id } });
    return event ? mapPaymentEvent(event) : null;
  }
}

export function mapPaymentEvent(row: PaymentEventRow): PaymentEvent {
  return {
    id: row.id,
    provider: row.provider,
    providerEventId: row.providerEventId,
    providerResourceId: row.providerResourceId,
    eventType: row.eventType,
    action: row.action,
    requestId: row.requestId,
    paymentAttemptId: row.paymentAttemptId,
    processingStatus: row.processingStatus,
    receivedAt: row.receivedAt,
    processedAt: row.processedAt,
    createdAt: row.createdAt,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "P2002";
}
