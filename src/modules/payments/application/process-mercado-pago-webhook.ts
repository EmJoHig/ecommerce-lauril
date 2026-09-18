import { ConflictError, ValidationError } from "@/shared/domain/errors";
import { convertReservationToSale } from "@/modules/inventory/domain/inventory";
import { assertOrderTransition } from "@/modules/orders/domain/order";
import { createPaymentEvent, type PaymentAttempt } from "../domain/payment";
import type { PaymentAttemptRepository } from "./payment-attempt-repository";
import type { PaymentEventRepository } from "./payment-event-repository";
import type { ExternalPaymentState, PaymentGateway } from "./payment-gateway";
import type {
  PaymentConfirmationOrder,
  PaymentConfirmationTransaction,
  PaymentConfirmationUnitOfWork,
} from "./payment-confirmation-unit-of-work";
import { mercadoPagoExternalReference } from "./mercado-pago-reference";

export type ProcessMercadoPagoWebhookInput = Readonly<{
  providerEventId: string;
  providerResourceId: string;
  eventType: string;
  action: string | null;
  requestId: string;
  receivedAt?: Date;
}>;

export type PaymentWebhookOutcome = Readonly<{
  kind: "approved" | "pending" | "requires_review" | "ignored" | "duplicate";
  reasonCode?: string;
  orderNumber?: bigint;
}>;

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
      await this.events.finishIfPending({
        id: event.id,
        processingStatus: "IGNORED",
        processedAt: now,
        paymentAttemptId: null,
      });
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
      return await this.unitOfWork.run((transaction) =>
        finalizeAuthoritativeState(transaction, event.id, attempt.id, external, now));
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

async function finalizeAuthoritativeState(
  transaction: PaymentConfirmationTransaction,
  eventId: string,
  attemptId: string,
  external: ExternalPaymentState,
  now: Date,
): Promise<PaymentWebhookOutcome> {
  const event = await transaction.findEvent(eventId);
  if (!event) throw new ConflictError("No se encontró el evento de pago persistido.");
  if (["PROCESSED", "IGNORED"].includes(event.processingStatus)) return { kind: "duplicate" };

  const attempt = await transaction.findAttempt(attemptId);
  if (!attempt) throw new ConflictError("No se encontró el intento de pago asociado.");
  const order = await transaction.findOrder(attempt.orderId);
  if (!order) {
    await finishReview(transaction, eventId, attempt, external, now);
    return { kind: "requires_review", reasonCode: "order_not_found" };
  }

  const integrityReason = paymentIntegrityFailure(attempt, order, external);
  const approved = external.providerStatus === "processed"
    && external.providerStatusDetail === "accredited";
  if (integrityReason || (approved && external.totalPaidAmountInCents !== order.totalInCents)) {
    await finishReview(transaction, eventId, attempt, external, now);
    return { kind: "requires_review", reasonCode: integrityReason ?? "paid_amount_mismatch", orderNumber: order.number };
  }

  if (order.status === "PAID" || attempt.status === "APPROVED") {
    if (order.status === "PAID" && attempt.status === "APPROVED" && approved) {
      await transaction.updateAttempt({
        id: attempt.id,
        status: "APPROVED",
        providerStatus: external.providerStatus,
        providerStatusDetail: external.providerStatusDetail,
        approvedAt: attempt.approvedAt ?? now,
        rejectedAt: null,
        refundedAmountInCents: external.refundedAmountInCents,
      });
      if (!(await transaction.finishEvent(eventId, attempt.id, now))) {
        throw new ConflictError("El evento cambió durante el procesamiento.");
      }
      return { kind: "duplicate", orderNumber: order.number };
    }
    await finishReview(transaction, eventId, attempt, external, now);
    return { kind: "requires_review", reasonCode: "local_payment_state_mismatch", orderNumber: order.number };
  }

  if (!approved) {
    const pending = isExpectedPendingState(external.providerStatus, external.providerStatusDetail);
    await transaction.updateAttempt({
      id: attempt.id,
      status: pending ? "PENDING" : "REQUIRES_REVIEW",
      providerStatus: external.providerStatus,
      providerStatusDetail: external.providerStatusDetail,
      approvedAt: attempt.approvedAt,
      rejectedAt: attempt.rejectedAt,
      refundedAmountInCents: external.refundedAmountInCents,
    });
    if (!(await transaction.finishEvent(eventId, attempt.id, now))) {
      throw new ConflictError("El evento cambió durante el procesamiento.");
    }
    return {
      kind: pending ? "pending" : "requires_review",
      ...(pending ? {} : { reasonCode: "provider_state_requires_review" }),
      orderNumber: order.number,
    };
  }

  if (order.status !== "PENDING_PAYMENT" || order.reservationReleasedAt) {
    await finishReview(transaction, eventId, attempt, external, now);
    return { kind: "requires_review", reasonCode: "reservation_released_or_order_closed", orderNumber: order.number };
  }

  const sales = reservationSales(order);
  if (!sales) {
    await finishReview(transaction, eventId, attempt, external, now);
    return { kind: "requires_review", reasonCode: "reservation_unavailable", orderNumber: order.number };
  }

  assertOrderTransition({ from: "PENDING_PAYMENT", to: "PAID", source: "PAYMENT" });
  for (const sale of sales) {
    if (!(await transaction.convertInventory({
      id: sale.inventoryId,
      expectedVersion: sale.version,
      stockOnHand: sale.stockAfter,
      stockReserved: sale.stockReservedAfter,
    }))) {
      throw new ConflictError("El inventario cambió durante la confirmación del pago.");
    }
    await transaction.createSaleMovement({
      inventoryId: sale.inventoryId,
      quantity: -sale.quantity,
      stockBefore: sale.stockBefore,
      stockAfter: sale.stockAfter,
      orderId: order.id,
      createdAt: now,
    });
  }
  if (!(await transaction.markOrderPaid(order.id, now))) {
    throw new ConflictError("El pedido cambió durante la confirmación del pago.");
  }
  await transaction.createPaidHistory(order.id, now);
  await transaction.updateAttempt({
    id: attempt.id,
    status: "APPROVED",
    providerStatus: external.providerStatus,
    providerStatusDetail: external.providerStatusDetail,
    approvedAt: now,
    rejectedAt: null,
    refundedAmountInCents: external.refundedAmountInCents,
  });
  if (!(await transaction.finishEvent(eventId, attempt.id, now))) {
    throw new ConflictError("El evento cambió durante el procesamiento.");
  }
  return { kind: "approved", orderNumber: order.number };
}

function paymentIntegrityFailure(
  attempt: PaymentAttempt,
  order: PaymentConfirmationOrder,
  external: ExternalPaymentState,
): string | null {
  if (attempt.provider !== "MERCADO_PAGO" || external.provider !== "MERCADO_PAGO") return "provider_mismatch";
  if (external.providerResourceId !== attempt.providerResourceId) return "provider_resource_mismatch";
  if (external.externalReference !== mercadoPagoExternalReference(order.number, attempt.attemptNumber)) {
    return "external_reference_mismatch";
  }
  if (external.currency !== "ARS" || external.currency !== attempt.currency || external.currency !== order.currency) {
    return "currency_mismatch";
  }
  if (external.totalAmountInCents !== attempt.amountInCents || external.totalAmountInCents !== order.totalInCents) {
    return "total_amount_mismatch";
  }
  return null;
}

function reservationSales(order: PaymentConfirmationOrder): ReadonlyArray<Readonly<{
  inventoryId: string;
  quantity: number;
  version: number;
  stockBefore: number;
  stockAfter: number;
  stockReservedAfter: number;
}>> | null {
  const grouped = new Map<string, { quantity: number; inventory: NonNullable<PaymentConfirmationOrder["items"][number]["inventory"]> }>();
  for (const item of order.items) {
    if (!item.inventory || !Number.isSafeInteger(item.quantity) || item.quantity < 1) return null;
    const current = grouped.get(item.inventory.id);
    if (current) {
      const quantity = current.quantity + item.quantity;
      if (!Number.isSafeInteger(quantity) || current.inventory.version !== item.inventory.version) return null;
      current.quantity = quantity;
    } else {
      grouped.set(item.inventory.id, { quantity: item.quantity, inventory: item.inventory });
    }
  }
  if (grouped.size === 0) return null;

  try {
    return [...grouped.values()].map(({ quantity, inventory }) => {
      const transition = convertReservationToSale(inventory.stockOnHand, inventory.stockReserved, quantity);
      return {
        inventoryId: inventory.id,
        quantity,
        version: inventory.version,
        stockBefore: transition.stockBefore,
        stockAfter: transition.stockAfter,
        stockReservedAfter: transition.stockReservedAfter,
      };
    });
  } catch (error) {
    if (error instanceof ValidationError) return null;
    throw error;
  }
}

async function finishReview(
  transaction: PaymentConfirmationTransaction,
  eventId: string,
  attempt: PaymentAttempt,
  external: ExternalPaymentState,
  now: Date,
): Promise<void> {
  await transaction.updateAttempt({
    id: attempt.id,
    status: "REQUIRES_REVIEW",
    providerStatus: external.providerStatus,
    providerStatusDetail: external.providerStatusDetail,
    approvedAt: attempt.approvedAt,
    rejectedAt: attempt.rejectedAt,
    refundedAmountInCents: external.refundedAmountInCents,
  });
  if (!(await transaction.finishEvent(eventId, attempt.id, now))) {
    throw new ConflictError("El evento cambió durante el procesamiento.");
  }
}

function isExpectedPendingState(status: string, detail: string | null): boolean {
  return (status === "created" && ["created", "pending_payment"].includes(detail ?? ""))
    || (status === "processing" && ["in_process", "pending_review_manual"].includes(detail ?? ""))
    || (status === "action_required" && detail === "waiting_capture");
}

function sameEvent(event: ReturnType<typeof createPaymentEvent>, input: ProcessMercadoPagoWebhookInput): boolean {
  return event.providerResourceId === input.providerResourceId
    && event.eventType === input.eventType;
}
