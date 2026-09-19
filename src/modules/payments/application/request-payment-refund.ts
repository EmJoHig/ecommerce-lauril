import { ConflictError, NotFoundError, ValidationError } from "@/shared/domain/errors";
import { mercadoPagoExternalReference } from "./mercado-pago-reference";
import type { AdminPaymentRefundRepository } from "./admin-payment-refund-repository";
import type { PaymentGateway } from "./payment-gateway";
import type { PaymentRefundRepository } from "./payment-refund-repository";
import { createPaymentRefund, type PaymentRefund } from "../domain/payment-refund";

export class RequestPaymentRefund {
  constructor(
    private readonly adminRefunds: AdminPaymentRefundRepository,
    private readonly refunds: PaymentRefundRepository,
    private readonly gateway: PaymentGateway,
  ) {}

  async execute(input: Readonly<{
    orderId: string;
    actorUserId: string;
    amountInCents: bigint | null;
  }>, now = new Date()) {
    const payment = await this.adminRefunds.findRefundablePayment(input.orderId);
    if (!payment) throw new NotFoundError("No se encontró un pago reembolsable para el pedido.");
    if (!["PAID", "PARTIALLY_REFUNDED"].includes(payment.orderStatus)
      || !["APPROVED", "PARTIALLY_REFUNDED"].includes(payment.attempt.status)
      || !payment.attempt.providerResourceId) {
      throw new ValidationError("El pedido no admite reembolsos en su estado actual.");
    }
    const active = await this.refunds.findActiveByAttemptId(payment.attempt.id);
    if (active) {
      const sameRequest = input.amountInCents === null
        ? active.kind === "FULL"
        : active.amountInCents === input.amountInCents;
      if (!sameRequest) throw new ConflictError("Ya existe otra solicitud de reembolso activa para este pago.");
      return this.submit(active, now);
    }
    const external = await this.gateway.getPaymentState(payment.attempt.providerResourceId);
    const refundableProviderState = external.providerStatus === "processed"
      && ["accredited", "partially_refunded"].includes(external.providerStatusDetail ?? "");
    if (!refundableProviderState
      || external.providerResourceId !== payment.attempt.providerResourceId
      || external.externalReference !== mercadoPagoExternalReference(payment.orderNumber, payment.attempt.attemptNumber)
      || external.currency !== payment.currency
      || payment.attempt.amountInCents !== payment.totalInCents
      || external.totalAmountInCents !== payment.attempt.amountInCents
      || external.refundedAmountInCents === null) {
      throw new ConflictError("El estado autoritativo del pago requiere revisión.");
    }
    const remaining = payment.attempt.amountInCents - external.refundedAmountInCents;
    if (remaining <= 0n) throw new ValidationError("El pago ya no posee importe reembolsable.");
    const requested = input.amountInCents ?? remaining;
    if (requested <= 0n) throw new ValidationError("El importe del reembolso debe ser positivo.");
    if (requested > remaining) throw new ValidationError("El reembolso supera el importe restante.");
    const kind = requested === remaining ? "FULL" : "PARTIAL";
    if (kind === "PARTIAL" && !external.paymentTransactionId) {
      throw new ConflictError("No existe una transacción de pago inequívoca para el reembolso parcial.");
    }
    const refund = await this.adminRefunds.acquireWithAudit(createPaymentRefund({
      paymentAttemptId: payment.attempt.id,
      provider: payment.attempt.provider,
      providerResourceId: payment.attempt.providerResourceId,
      kind,
      amountInCents: requested,
      paymentTransactionId: kind === "PARTIAL" ? external.paymentTransactionId : null,
    }, now), payment.orderId, input.actorUserId);
    if (refund.kind !== kind || refund.amountInCents !== requested) {
      throw new ConflictError("Ya existe otra solicitud de reembolso activa para este pago.");
    }
    return this.submit(refund, now);
  }

  private async submit(refund: PaymentRefund, now: Date): Promise<PaymentRefund> {
    if (refund.status === "SUBMITTED") return refund;
    try {
      const result = await this.gateway.refundOrder({
        providerResourceId: refund.providerResourceId,
        idempotencyKey: refund.idempotencyKey,
        kind: refund.kind,
        amountInCents: refund.amountInCents,
        paymentTransactionId: refund.paymentTransactionId,
      });
      return this.refunds.updateStatus({
        id: refund.id,
        status: "SUBMITTED",
        providerRefundId: result.providerRefundId,
        providerStatus: result.providerStatus,
        failureCode: null,
        submittedAt: now,
      });
    } catch (error) {
      if (isTransient(error)) throw error;
      await this.refunds.updateStatus({ id: refund.id, status: "REQUIRES_REVIEW", failureCode: failureCode(error) });
      throw new ConflictError("Mercado Pago no aceptó el reembolso; requiere revisión.");
    }
  }
}

function isTransient(error: unknown): boolean {
  return error instanceof Error && "code" in error
    && ["TIMEOUT", "NETWORK", "RESOURCE_LOCKED", "RATE_LIMITED", "UNAVAILABLE"].includes(String(error.code));
}

function failureCode(error: unknown): string {
  if (!(error instanceof Error)) return "PROVIDER_ERROR";
  const candidate = "providerCode" in error && error.providerCode ? String(error.providerCode) : "code" in error ? String(error.code) : "PROVIDER_ERROR";
  return /^[a-z0-9_-]{1,100}$/i.test(candidate) ? candidate : "PROVIDER_ERROR";
}
