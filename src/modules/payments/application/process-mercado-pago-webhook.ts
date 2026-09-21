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
import { createPaymentRefund, type PaymentRefund } from "../domain/payment-refund";

export type ProcessMercadoPagoWebhookInput = Readonly<{
  providerEventId: string;
  providerResourceId: string;
  eventType: string;
  action: string | null;
  requestId: string;
  receivedAt?: Date;
}>;

export type PaymentWebhookOutcome = Readonly<{
  kind: "approved" | "pending" | "rejected" | "cancelled" | "partially_refunded" | "refunded" | "requires_review" | "ignored" | "duplicate";
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
      const result = await this.unitOfWork.run((transaction) =>
        finalizeAuthoritativeState(transaction, event.id, attempt.id, external, now));
      if (!("lateRefund" in result)) return result;
      return await this.submitLateRefund(event.id, attempt.id, result.lateRefund, result.orderNumber, now);
    } catch (error) {
      await this.markFailed(event.id, attempt.id, now);
      throw new PaymentWebhookTechnicalError("No se pudo confirmar atómicamente el pago.", { cause: error });
    }
  }

  private async submitLateRefund(
    eventId: string,
    attemptId: string,
    refund: PaymentRefund,
    orderNumber: bigint,
    now: Date,
  ): Promise<PaymentWebhookOutcome> {
    try {
      const external = await this.gateway.refundOrder({
        providerResourceId: refund.providerResourceId,
        idempotencyKey: refund.idempotencyKey,
        kind: "FULL",
        amountInCents: refund.amountInCents,
        paymentTransactionId: null,
      });
      await this.unitOfWork.run(async (transaction) => {
        await transaction.updateRefund({
          id: refund.id,
          status: "SUBMITTED",
          providerRefundId: external.providerRefundId,
          providerStatus: external.providerStatus,
          failureCode: null,
          submittedAt: now,
        });
        if (!(await transaction.finishEvent(eventId, attemptId, now))) {
          throw new ConflictError("El evento cambió durante el auto-reembolso.");
        }
      });
      return { kind: "requires_review", reasonCode: "late_payment_refund_submitted", orderNumber };
    } catch (error) {
      if (isTransientLateRefundError(error)) throw error;
      const failureCode = sanitizedFailureCode(error);
      await this.unitOfWork.run(async (transaction) => {
        await transaction.updateRefund({ id: refund.id, status: "REQUIRES_REVIEW", failureCode });
        const current = await transaction.findAttempt(attemptId);
        if (current) await transaction.updateAttempt({
          id: current.id,
          status: "REQUIRES_REVIEW",
          providerStatus: current.providerStatus ?? "processed",
          providerStatusDetail: current.providerStatusDetail,
          approvedAt: current.approvedAt,
          rejectedAt: current.rejectedAt,
          refundedAmountInCents: current.refundedAmountInCents,
        });
        if (!(await transaction.finishEvent(eventId, attemptId, now))) {
          throw new ConflictError("El evento cambió durante el auto-reembolso.");
        }
      });
      console.warn(JSON.stringify({ event: "payment.refund_requires_review", paymentAttemptId: attemptId, failureCode }));
      return { kind: "requires_review", reasonCode: "late_payment_refund_requires_review", orderNumber };
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
): Promise<PaymentWebhookOutcome | Readonly<{ lateRefund: PaymentRefund; orderNumber: bigint }>> {
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
  const state = classifyProviderState(external);
  const approved = state === "approved";
  if (integrityReason || (approved && external.totalPaidAmountInCents !== order.totalInCents)) {
    await finishReview(transaction, eventId, attempt, external, now);
    return { kind: "requires_review", reasonCode: integrityReason ?? "paid_amount_mismatch", orderNumber: order.number };
  }

  if ((state === "partially_refunded" || state === "refunded") && external.refundedAmountInCents === null) {
    await finishReview(transaction, eventId, attempt, external, now);
    return { kind: "requires_review", reasonCode: "refund_amount_unavailable", orderNumber: order.number };
  }
  if (external.refundedAmountInCents !== null && external.refundedAmountInCents > attempt.amountInCents) {
    await finishReview(transaction, eventId, attempt, external, now);
    return { kind: "requires_review", reasonCode: "refund_amount_exceeds_payment", orderNumber: order.number };
  }
  if (state === "refunded" && external.refundedAmountInCents !== attempt.amountInCents) {
    await finishReview(transaction, eventId, attempt, external, now);
    return { kind: "requires_review", reasonCode: "incomplete_total_refund_amount", orderNumber: order.number };
  }

  if (state === "partially_refunded" || state === "refunded") {
    return confirmRefund(transaction, eventId, attempt, order, external, state, now);
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
        refundedAmountInCents: external.refundedAmountInCents ?? attempt.refundedAmountInCents,
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
    const mappedStatus = state === "pending" ? "PENDING"
      : state === "rejected" ? "REJECTED"
      : state === "cancelled" ? "CANCELLED"
      : "REQUIRES_REVIEW";
    await transaction.updateAttempt({
      id: attempt.id,
      status: mappedStatus,
      providerStatus: external.providerStatus,
      providerStatusDetail: external.providerStatusDetail,
      approvedAt: attempt.approvedAt,
      rejectedAt: state === "rejected" ? now : attempt.rejectedAt,
      refundedAmountInCents: external.refundedAmountInCents ?? attempt.refundedAmountInCents,
    });
    if (!(await transaction.finishEvent(eventId, attempt.id, now))) {
      throw new ConflictError("El evento cambió durante el procesamiento.");
    }
    return {
      kind: state === "pending" ? "pending"
        : state === "rejected" ? "rejected"
        : state === "cancelled" ? "cancelled"
        : "requires_review",
      ...(state === "unknown" ? { reasonCode: "provider_state_requires_review" } : {}),
      orderNumber: order.number,
    };
  }

  if (order.status !== "PENDING_PAYMENT" || order.reservationReleasedAt) {
    const refund = await acquireLateRefund(transaction, attempt, now);
    await transaction.updateAttempt({
      id: attempt.id,
      status: "REQUIRES_REVIEW",
      providerStatus: external.providerStatus,
      providerStatusDetail: external.providerStatusDetail,
      approvedAt: attempt.approvedAt,
      rejectedAt: null,
      refundedAmountInCents: attempt.refundedAmountInCents,
    });
    return { lateRefund: refund, orderNumber: order.number };
  }

  const sales = reservationSales(order);
  if (!sales) {
    const refund = await acquireLateRefund(transaction, attempt, now);
    await transaction.updateAttempt({
      id: attempt.id,
      status: "REQUIRES_REVIEW",
      providerStatus: external.providerStatus,
      providerStatusDetail: external.providerStatusDetail,
      approvedAt: attempt.approvedAt,
      rejectedAt: null,
      refundedAmountInCents: attempt.refundedAmountInCents,
    });
    return { lateRefund: refund, orderNumber: order.number };
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
    refundedAmountInCents: external.refundedAmountInCents ?? 0n,
  });
  if (!(await transaction.finishEvent(eventId, attempt.id, now))) {
    throw new ConflictError("El evento cambió durante el procesamiento.");
  }
  return { kind: "approved", orderNumber: order.number };
}

async function confirmRefund(
  transaction: PaymentConfirmationTransaction,
  eventId: string,
  attempt: PaymentAttempt,
  order: PaymentConfirmationOrder,
  external: ExternalPaymentState,
  state: "partially_refunded" | "refunded",
  now: Date,
): Promise<PaymentWebhookOutcome> {
  const refunded = state === "refunded" ? attempt.amountInCents : external.refundedAmountInCents!;
  if (state === "partially_refunded" && (refunded <= 0n || refunded >= attempt.amountInCents)) {
    await finishReview(transaction, eventId, attempt, external, now);
    return { kind: "requires_review", reasonCode: "invalid_partial_refund_amount", orderNumber: order.number };
  }
  const lateSale = order.status === "CANCELLED";
  if (!lateSale) {
    const expected = order.status === "PAID"
      || order.status === "PARTIALLY_REFUNDED"
      || (state === "refunded" && order.status === "REFUNDED");
    if (!expected) {
      await finishReview(transaction, eventId, attempt, external, now);
      return { kind: "requires_review", reasonCode: "local_refund_state_mismatch", orderNumber: order.number };
    }
    const target = state === "partially_refunded" ? "PARTIALLY_REFUNDED" : "REFUNDED";
    if (order.status !== target && order.status !== "REFUNDED") {
      assertOrderTransition({ from: order.status, to: target, source: "PAYMENT" });
      if (!(await transaction.transitionOrderRefund({
        orderId: order.id,
        fromStatus: order.status as "PAID" | "PARTIALLY_REFUNDED",
        toStatus: target,
        changedAt: now,
        reason: state === "partially_refunded"
          ? "Pago reembolsado parcialmente por Mercado Pago."
          : "Pago reembolsado totalmente por Mercado Pago.",
      }))) throw new ConflictError("El pedido cambió durante la confirmación del reembolso.");
    }
  } else if (state !== "refunded") {
    await finishReview(transaction, eventId, attempt, external, now);
    return { kind: "requires_review", reasonCode: "late_payment_partial_refund", orderNumber: order.number };
  }
  await transaction.updateAttempt({
    id: attempt.id,
    status: state === "partially_refunded" ? "PARTIALLY_REFUNDED" : "REFUNDED",
    providerStatus: external.providerStatus,
    providerStatusDetail: external.providerStatusDetail,
    approvedAt: attempt.approvedAt,
    rejectedAt: attempt.rejectedAt,
    refundedAmountInCents: refunded,
  });
  const activeRefund = await transaction.findActiveRefund(attempt.id)
    ?? (lateSale && state === "refunded"
      ? await transaction.findLateRefundInReview({
        paymentAttemptId: attempt.id,
        providerResourceId: external.providerResourceId,
        amountInCents: attempt.amountInCents,
      })
      : null);
  const authoritativeDelta = refunded - attempt.refundedAmountInCents;
  if (activeRefund && ((state === "refunded" && activeRefund.kind === "FULL")
    || (state === "partially_refunded" && activeRefund.kind === "PARTIAL"
      && authoritativeDelta > 0n && activeRefund.amountInCents === authoritativeDelta))) {
    await transaction.updateRefund({
      id: activeRefund.id,
      status: "CONFIRMED",
      providerStatus: external.providerStatusDetail,
      failureCode: null,
      confirmedAt: now,
    });
  }
  if (!(await transaction.finishEvent(eventId, attempt.id, now))) {
    throw new ConflictError("El evento cambió durante la confirmación del reembolso.");
  }
  return { kind: state, orderNumber: order.number };
}

async function acquireLateRefund(
  transaction: PaymentConfirmationTransaction,
  attempt: PaymentAttempt,
  now: Date,
): Promise<PaymentRefund> {
  const active = await transaction.findActiveRefund(attempt.id);
  if (active) return active;
  if (!attempt.providerResourceId) throw new ConflictError("El intento no posee recurso externo.");
  const refund = createPaymentRefund({
    paymentAttemptId: attempt.id,
    provider: attempt.provider,
    providerResourceId: attempt.providerResourceId,
    kind: "FULL",
    amountInCents: attempt.amountInCents,
    paymentTransactionId: null,
  }, now);
  await transaction.createRefund(refund);
  return refund;
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
    refundedAmountInCents: external.refundedAmountInCents ?? attempt.refundedAmountInCents,
  });
  if (!(await transaction.finishEvent(eventId, attempt.id, now))) {
    throw new ConflictError("El evento cambió durante el procesamiento.");
  }
}

function classifyProviderState(external: ExternalPaymentState):
  "pending" | "approved" | "rejected" | "cancelled" | "partially_refunded" | "refunded" | "unknown" {
  const status = external.providerStatus;
  const detail = external.providerStatusDetail;
  if (status === "processed" && detail === "accredited") return "approved";
  if (status === "processed" && detail === "partially_refunded") return "partially_refunded";
  if ((status === "processed" || status === "refunded") && detail === "refunded") return "refunded";
  if (status === "failed") return "rejected";
  if ((status === "canceled" || status === "cancelled")
    && ["canceled", "cancelled", "cancelled_by_user", "cancelled_by_provider"].includes(detail ?? status)) return "cancelled";
  if ((status === "created" && detail === "created")
    || (status === "processing" && ["in_process", "pending_review_manual"].includes(detail ?? ""))
    || (status === "action_required" && ["waiting_payment", "waiting_capture"].includes(detail ?? ""))) return "pending";
  return "unknown";
}

function gatewayErrorCode(error: unknown): string | null {
  if (!(error instanceof Error) || !("code" in error)) return null;
  const code = String(error.code);
  return /^[A-Z0-9_-]{1,100}$/.test(code) ? code : null;
}

function isTransientLateRefundError(error: unknown): boolean {
  const code = gatewayErrorCode(error);
  // Orders can temporarily reject an immediate late-payment refund with this code.
  return ["TIMEOUT", "NETWORK", "RESOURCE_LOCKED", "RATE_LIMITED", "UNAVAILABLE"].includes(code ?? "")
    || (code === "INVALID_REQUEST" && error instanceof Error
      && "providerCode" in error && error.providerCode === "unprocessable_content");
}

function sanitizedFailureCode(error: unknown): string {
  const providerCode = error instanceof Error && "providerCode" in error
    ? String(error.providerCode ?? "")
    : "";
  if (/^[a-z0-9_-]{1,100}$/i.test(providerCode)) return providerCode;
  return gatewayErrorCode(error) ?? "PROVIDER_ERROR";
}

function sameEvent(event: ReturnType<typeof createPaymentEvent>, input: ProcessMercadoPagoWebhookInput): boolean {
  return event.providerResourceId === input.providerResourceId
    && event.eventType === input.eventType;
}
