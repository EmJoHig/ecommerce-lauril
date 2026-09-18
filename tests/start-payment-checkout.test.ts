import { describe, expect, it, vi } from "vitest";
import type { PaymentOrderRecord, PaymentOrderReader } from "@/modules/orders/application/order-repository";
import type { PaymentAttemptRepository } from "@/modules/payments/application/payment-attempt-repository";
import type { ExternalCheckout, PaymentGateway } from "@/modules/payments/application/payment-gateway";
import { StartPaymentCheckout } from "@/modules/payments/application/start-payment-checkout";
import { createPaymentAttempt, type PaymentAttempt } from "@/modules/payments/domain/payment";

const orderId = "10000000-0000-4000-8000-000000000001";
const now = new Date("2026-09-18T12:00:00.000Z");

describe("StartPaymentCheckout", () => {
  it("reutiliza un checkout persistido sin ejecutar otro POST", async () => {
    const attempt = {
      ...newAttempt(),
      status: "PENDING" as const,
      providerResourceId: "mp-order-1",
      checkoutUrl: "https://checkout.mercadopago.test/order-1",
    };
    const context = setup({ attempt });

    await expect(context.useCase.execute(orderId, now)).resolves.toEqual({
      attemptId: attempt.id,
      checkoutUrl: "https://checkout.mercadopago.test/order-1",
      reused: true,
    });
    expect(context.gateway.createCheckout).not.toHaveBeenCalled();
    expect(context.attempts.updateSnapshot).not.toHaveBeenCalled();
  });

  it("un retry técnico de CREATED vuelve a usar exactamente la misma idempotencyKey", async () => {
    const attempt = newAttempt();
    const context = setup({ attempt });
    context.gateway.createCheckout
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(externalCheckout());

    await expect(context.useCase.execute(orderId, now)).rejects.toThrow("network");
    await expect(context.useCase.execute(orderId, now)).resolves.toMatchObject({ reused: false });

    expect(context.gateway.createCheckout).toHaveBeenCalledTimes(2);
    expect(context.gateway.createCheckout.mock.calls[0]?.[0].idempotencyKey).toBe(attempt.idempotencyKey);
    expect(context.gateway.createCheckout.mock.calls[1]?.[0].idempotencyKey).toBe(attempt.idempotencyKey);
    expect(context.attempts.updateSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      id: attempt.id,
      status: "PENDING",
      providerResourceId: "mp-order-1",
    }));
  });

  it("rechaza pedidos no pendientes, vencidos o con reserva liberada antes de adquirir intento", async () => {
    const invalidOrders: PaymentOrderRecord[] = [
      { ...paymentOrder(), status: "CANCELLED" },
      { ...paymentOrder(), paymentExpiresAt: now },
      { ...paymentOrder(), reservationReleasedAt: new Date(now.getTime() - 1) },
    ];
    for (const order of invalidOrders) {
      const context = setup({ order });
      await expect(context.useCase.execute(orderId, now)).rejects.toThrow();
      expect(context.attempts.acquireActive).not.toHaveBeenCalled();
      expect(context.gateway.createCheckout).not.toHaveBeenCalled();
    }
  });
});

function setup(overrides: { order?: PaymentOrderRecord; attempt?: PaymentAttempt } = {}) {
  const order = overrides.order ?? paymentOrder();
  const attempt = overrides.attempt ?? newAttempt();
  const orders: PaymentOrderReader = { findPaymentOrder: vi.fn().mockResolvedValue(order) };
  const attempts = {
    acquireActive: vi.fn().mockResolvedValue(attempt),
    updateSnapshot: vi.fn().mockResolvedValue({ ...attempt, status: "PENDING" }),
    create: vi.fn(), findById: vi.fn(), findByProviderResourceId: vi.fn(), listByOrderId: vi.fn(),
  } satisfies PaymentAttemptRepository;
  const gateway = {
    createCheckout: vi.fn().mockResolvedValue(externalCheckout()),
    getPaymentState: vi.fn(),
  } satisfies PaymentGateway;
  return { orders, attempts, gateway, useCase: new StartPaymentCheckout(orders, attempts, gateway) };
}

function paymentOrder(): PaymentOrderRecord {
  return {
    id: orderId,
    number: 10001n,
    status: "PENDING_PAYMENT",
    buyerEmail: "buyer@example.com",
    totalInCents: 4600n,
    currency: "ARS",
    paymentExpiresAt: new Date(now.getTime() + 60_000),
    reservationReleasedAt: null,
  };
}

function newAttempt(): PaymentAttempt {
  return createPaymentAttempt({
    orderId,
    provider: "MERCADO_PAGO",
    attemptNumber: 1,
    amountInCents: 4600n,
    currency: "ARS",
  }, now);
}

function externalCheckout(): ExternalCheckout {
  return {
    provider: "MERCADO_PAGO",
    providerResourceId: "mp-order-1",
    providerStatus: "created",
    providerStatusDetail: "pending_payment",
    currency: "ARS",
    totalAmountInCents: 4600n,
    totalPaidAmountInCents: null,
    approvedAt: null,
    rejectedAt: null,
    refundedAmountInCents: 0n,
    checkoutUrl: "https://checkout.mercadopago.test/order-1",
  };
}
