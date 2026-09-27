import { ValidationError } from "@/shared/domain/errors";
import { createPaymentEvent } from "../domain/payment";
import type { PaymentAttemptRepository } from "./payment-attempt-repository";
import type { PaymentEventRepository } from "./payment-event-repository";
import type { ExternalPaymentState, PaymentGateway } from "./payment-gateway";
import type {
  PaymentConfirmationUnitOfWork,
} from "./payment-confirmation-unit-of-work";
import { FinalizeMercadoPagoPayment, type PaymentWebhookOutcome } from "./finalize-mercado-pago-payment";

export type ProcessMercadoPagoWebhookInput = Readonly<{
  providerEventId: string;
  providerResourceId: string;
  eventType: string;
  action: string | null;
  requestId: string;
  receivedAt?: Date;
}>;

export type { PaymentWebhookOutcome } from "./finalize-mercado-pago-payment";

export class PaymentWebhookTechnicalError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PaymentWebhookTechnicalError";
  }
}

export class ProcessMercadoPagoWebhook {
  constructor(
    private readonly attempts: PaymentAttemptRepository,
    private readonly events: PaymentEventRepository,
    private readonly gateway: PaymentGateway,
    private readonly unitOfWork: PaymentConfirmationUnitOfWork,
  ) {}

  async execute(input: ProcessMercadoPagoWebhookInput): Promise<PaymentWebhookOutcome> {
    const now = input.receivedAt ?? new Date();
    const persisted = await this.events.persistIfAbsent(createPaymentEvent({
      provider: "MERCADO_PAGO",
      providerEventId: input.providerEventId,
      providerResourceId: input.providerResourceId,
      eventType: input.eventType,
      action: input.action,
      requestId: input.requestId,
      receivedAt: now,
    }));
    const event = persisted.event;

    if (!sameEvent(event, input)) {
      throw new ValidationError("El identificador del evento ya existe con otros metadatos.");
    }
    if (["PROCESSED", "IGNORED"].includes(event.processingStatus)) {
      return { kind: "duplicate" };
    }
    if (input.eventType !== "order") {
      await this.events.finishIfPending({
        id: event.id,
        processingStatus: "IGNORED",
        processedAt: now,
        paymentAttemptId: null,
      });
      return { kind: "ignored", reasonCode: "unsupported_event_type" };
    }

    const attempt = await this.attempts.findByProviderResourceId("MERCADO_PAGO", input.providerResourceId);
    if (!attempt) {
      // Checkout creation may not have persisted the resource yet. Leave the
      // event retryable so the same providerEventId can resolve it later.
      return { kind: "ignored", reasonCode: "unknown_provider_resource" };
    }

    let external: ExternalPaymentState;
    try {
      external = await this.gateway.getPaymentState(input.providerResourceId);
    } catch (error) {
      await this.markFailed(event.id, attempt.id, now);
      throw new PaymentWebhookTechnicalError("No se pudo consultar el estado autoritativo del pago.", { cause: error });
    }

    try {
      return await new FinalizeMercadoPagoPayment(this.gateway, this.unitOfWork)
        .execute(attempt.id, external, now, event.id);
    } catch (error) {
      await this.markFailed(event.id, attempt.id, now);
      throw new PaymentWebhookTechnicalError("No se pudo confirmar atómicamente el pago.", { cause: error });
    }
  }

  private async markFailed(eventId: string, attemptId: string, now: Date): Promise<void> {
    await this.events.finishIfPending({
      id: eventId,
      processingStatus: "FAILED",
      processedAt: null,
      paymentAttemptId: attemptId,
    });
  }
}

function sameEvent(event: ReturnType<typeof createPaymentEvent>, input: ProcessMercadoPagoWebhookInput): boolean {
  return event.providerResourceId === input.providerResourceId
    && event.eventType === input.eventType;
}
