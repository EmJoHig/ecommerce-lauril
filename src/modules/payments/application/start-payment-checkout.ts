import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from "@/shared/domain/errors";
import { validateId } from "@/modules/orders/domain/order";
import type { PaymentOrderReader } from "@/modules/orders/application/order-repository";
import type { PaymentAttemptRepository } from "./payment-attempt-repository";
import type { PaymentGateway } from "./payment-gateway";
import { secureCheckoutUrl } from "./payment-redirect";

export type StartPaymentCheckoutResult = Readonly<{
  attemptId: string;
  checkoutUrl: string;
  reused: boolean;
}>;

export class StartPaymentCheckout {
  constructor(
    private readonly orders: PaymentOrderReader,
    private readonly attempts: PaymentAttemptRepository,
    private readonly gateway: PaymentGateway,
  ) {}

  async execute(orderId: string, customerId: string, now = new Date()): Promise<StartPaymentCheckoutResult> {
    if (typeof customerId !== "string" || !customerId) throw new UnauthorizedError("Ingresá a tu cuenta para pagar.");
    const customer = await this.orders.findCustomer(validateId(customerId));
    if (!customer || customer.status !== "ACTIVE" || customer.userStatus !== "ACTIVE") {
      throw new UnauthorizedError("No se encontró la cuenta activa.");
    }
    const order = await this.orders.findPaymentOrder(validateId(orderId));
    if (!order || order.customerId !== customer.id) throw new NotFoundError("No se encontró el pedido.");
    if (order.status !== "PENDING_PAYMENT") {
      throw new ValidationError("El pedido no está pendiente de pago.");
    }
    if (order.paymentExpiresAt <= now) {
      throw new ValidationError("La reserva del pedido está vencida.");
    }
    if (order.reservationReleasedAt) {
      throw new ValidationError("La reserva del pedido ya fue liberada.");
    }

    const attempt = await this.attempts.acquireActive({
      orderId: order.id,
      provider: "MERCADO_PAGO",
      amountInCents: order.totalInCents,
      currency: order.currency,
      createdAt: now,
    });
    if (attempt.amountInCents !== order.totalInCents || attempt.currency !== order.currency) {
      throw new ConflictError("El intento activo no coincide con el total vigente del pedido.");
    }
    if (attempt.checkoutUrl && attempt.providerResourceId) {
      return { attemptId: attempt.id, checkoutUrl: secureCheckoutUrl(attempt.checkoutUrl), reused: true };
    }
    if (attempt.checkoutUrl && !attempt.providerResourceId) {
      throw new ConflictError("El intento activo posee un checkout incompleto.");
    }

    const external = await this.gateway.createCheckout({
      idempotencyKey: attempt.idempotencyKey,
      orderId: order.id,
      orderNumber: order.number,
      attemptNumber: attempt.attemptNumber,
      amountInCents: order.totalInCents,
      currency: order.currency,
      payerEmail: order.buyerEmail,
    });
    if (external.currency !== order.currency || external.totalAmountInCents !== order.totalInCents) {
      throw new ConflictError("El checkout externo no coincide con el total vigente del pedido.");
    }
    const checkoutUrl = secureCheckoutUrl(external.checkoutUrl);
    await this.attempts.updateSnapshot({
      id: attempt.id,
      status: "PENDING",
      providerResourceId: external.providerResourceId,
      checkoutUrl,
      providerStatus: external.providerStatus,
      providerStatusDetail: external.providerStatusDetail,
      approvedAt: null,
      rejectedAt: null,
      refundedAmountInCents: external.refundedAmountInCents ?? 0n,
    });
    return { attemptId: attempt.id, checkoutUrl, reused: false };
  }
}
