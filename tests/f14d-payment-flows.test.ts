import { describe, expect, it, vi } from "vitest";
import { createPaymentAttempt, createPaymentEvent, type PaymentAttempt, type PaymentEvent } from "@/modules/payments/domain/payment";
import { createPaymentRefund, type PaymentRefund } from "@/modules/payments/domain/payment-refund";
import type { PaymentAttemptRepository } from "@/modules/payments/application/payment-attempt-repository";
import type { PaymentEventRepository } from "@/modules/payments/application/payment-event-repository";
import type { PaymentGateway, ExternalPaymentState } from "@/modules/payments/application/payment-gateway";
import type { PaymentConfirmationOrder, PaymentConfirmationTransaction, PaymentConfirmationUnitOfWork } from "@/modules/payments/application/payment-confirmation-unit-of-work";
import { PaymentWebhookTechnicalError, ProcessMercadoPagoWebhook } from "@/modules/payments/application/process-mercado-pago-webhook";
import { PrismaPaymentAttemptRepository } from "@/modules/payments/infrastructure/prisma-payment-attempt-repository";
import { RequestPaymentRefund } from "@/modules/payments/application/request-payment-refund";
import type { AdminPaymentRefundRepository, RefundablePayment } from "@/modules/payments/application/admin-payment-refund-repository";
import type { PaymentRefundRepository } from "@/modules/payments/application/payment-refund-repository";
import type { PrismaClient } from "@/generated/prisma/client";

const now = new Date("2026-09-19T12:00:00.000Z");
const orderId = "10000000-0000-4000-8000-000000000001";
const adminId = "20000000-0000-4000-8000-000000000001";

describe("F14D payment terminal states and refunds", () => {
  it("provider failed rechaza solo el intento y conserva pedido, reserva e inventario", async () => {
    const fixture = webhookFixture(state({ providerStatus: "failed", providerStatusDetail: "rejected", totalPaidAmountInCents: 0n }));
    await expect(fixture.processor.execute(eventInput("failed"))).resolves.toMatchObject({ kind: "rejected" });
    expect(fixture.attempt.status).toBe("REJECTED");
    expect(fixture.attempt.rejectedAt).toEqual(now);
    expect(fixture.order).toMatchObject({ status: "PENDING_PAYMENT", reservationReleasedAt: null });
    expect(fixture.inventoryWrites).toBe(0);
  });

  it("provider canceled conserva el pedido pendiente y REJECTED/CANCELLED habilitan intento nuevo con otra key", async () => {
    const fixture = webhookFixture(state({ providerStatus: "canceled", providerStatusDetail: "canceled", totalPaidAmountInCents: 0n }));
    await expect(fixture.processor.execute(eventInput("cancelled"))).resolves.toMatchObject({ kind: "cancelled" });
    expect(fixture.attempt.status).toBe("CANCELLED");
    expect(fixture.order.status).toBe("PENDING_PAYMENT");

    for (const terminal of ["REJECTED", "CANCELLED"] as const) {
      const previous = { ...baseAttempt(), status: terminal };
      const create = vi.fn(async ({ data }: { data: PaymentAttempt }) => data);
      const paymentAttempt = {
        findFirst: vi.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ attemptNumber: 1, status: terminal }),
        create,
      };
      const next = await new PrismaPaymentAttemptRepository({ paymentAttempt } as unknown as PrismaClient).acquireActive({
        orderId, provider: "MERCADO_PAGO", amountInCents: 4600n, currency: "ARS", createdAt: now,
      });
      expect(next.attemptNumber).toBe(2);
      expect(next.idempotencyKey).not.toBe(previous.idempotencyKey);
    }
  });

  it("refund administrativo reintenta el mismo PaymentRefund y la misma key tras error de red", async () => {
    const attempt = { ...baseAttempt(), status: "APPROVED" as const, providerResourceId: "MP-1", approvedAt: now };
    const payment: RefundablePayment = {
      orderId, orderNumber: 10001n, orderStatus: "PAID", totalInCents: 4600n, currency: "ARS", attempt,
    };
    let active: PaymentRefund | null = null;
    const adminRepository: AdminPaymentRefundRepository = {
      findRefundablePayment: async () => payment,
      acquireWithAudit: async (refund) => active ??= refund,
    };
    const refundRepository: PaymentRefundRepository = {
      acquireActive: async (refund) => active ??= refund,
      findActiveByAttemptId: async () => active,
      updateStatus: async (input) => active = { ...active!, ...input, updatedAt: now },
    };
    const refundOrder = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("network"), { code: "NETWORK" }))
      .mockResolvedValueOnce({ providerRefundId: "REF-1", providerStatus: "submitted" });
    const gateway = gatewayFor(state({ paymentTransactionId: "PAY-1" }), refundOrder);
    const useCase = new RequestPaymentRefund(adminRepository, refundRepository, gateway);
    await expect(useCase.execute({ orderId, actorUserId: adminId, amountInCents: null }, now)).rejects.toThrow();
    const persistedKey = active!.idempotencyKey;
    await expect(useCase.execute({ orderId, actorUserId: adminId, amountInCents: null }, now)).resolves.toMatchObject({ status: "SUBMITTED" });
    expect(refundOrder).toHaveBeenCalledTimes(2);
    expect(refundOrder.mock.calls.map(([input]) => input.idempotencyKey)).toEqual([persistedKey, persistedKey]);
  });

  it("confirma refund parcial PAID -> PARTIALLY_REFUNDED sin tocar inventario ni duplicar history", async () => {
    const fixture = webhookFixture(state({
      providerStatus: "processed", providerStatusDetail: "partially_refunded", refundedAmountInCents: 1200n,
    }), { status: "PAID", attemptStatus: "APPROVED" });
    fixture.addRefund("PARTIAL", 1200n, "SUBMITTED");
    await expect(fixture.processor.execute(eventInput("partial-1"))).resolves.toMatchObject({ kind: "partially_refunded" });
    expect(fixture.order.status).toBe("PARTIALLY_REFUNDED");
    expect(fixture.attempt).toMatchObject({ status: "PARTIALLY_REFUNDED", refundedAmountInCents: 1200n });
    expect(fixture.refunds[0]?.status).toBe("CONFIRMED");
    expect(fixture.history).toEqual([{ from: "PAID", to: "PARTIALLY_REFUNDED" }]);
    expect(fixture.inventoryWrites).toBe(0);

    await fixture.processor.execute(eventInput("partial-2"));
    expect(fixture.history).toHaveLength(1);
  });

  it("confirma refund total desde PAID o PARTIALLY_REFUNDED sin restock", async () => {
    for (const initial of ["PAID", "PARTIALLY_REFUNDED"] as const) {
      const fixture = webhookFixture(state({
        providerStatus: "refunded", providerStatusDetail: "refunded", refundedAmountInCents: 4600n,
      }), { status: initial, attemptStatus: initial === "PAID" ? "APPROVED" : "PARTIALLY_REFUNDED" });
      fixture.addRefund("FULL", initial === "PAID" ? 4600n : 3400n, "SUBMITTED");
      await expect(fixture.processor.execute(eventInput(`full-${initial}`))).resolves.toMatchObject({ kind: "refunded" });
      expect(fixture.order.status).toBe("REFUNDED");
      expect(fixture.attempt).toMatchObject({ status: "REFUNDED", refundedAmountInCents: 4600n });
      expect(fixture.history).toEqual([{ from: initial, to: "REFUNDED" }]);
      expect(fixture.inventoryWrites).toBe(0);
    }
  });

  it("late payment crea un único auto-refund, reusa key tras fallo transitorio y mantiene CANCELLED al confirmarse", async () => {
    const refundOrder = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("locked"), { code: "RESOURCE_LOCKED" }))
      .mockResolvedValueOnce({ providerRefundId: "REF-LATE", providerStatus: "submitted" });
    const fixture = webhookFixture(state(), { status: "CANCELLED", reservationReleasedAt: now, refundOrder });
    await expect(fixture.processor.execute(eventInput("late"))).rejects.toBeInstanceOf(PaymentWebhookTechnicalError);
    expect(fixture.refunds).toHaveLength(1);
    const key = fixture.refunds[0]!.idempotencyKey;
    await expect(fixture.processor.execute(eventInput("late"))).resolves.toMatchObject({ reasonCode: "late_payment_refund_submitted" });
    expect(fixture.refunds).toHaveLength(1);
    expect(refundOrder.mock.calls.map(([input]) => input.idempotencyKey)).toEqual([key, key]);
    expect(fixture.order.status).toBe("CANCELLED");
    expect(fixture.inventoryWrites).toBe(0);

    fixture.setExternal(state({ providerStatus: "refunded", providerStatusDetail: "refunded", refundedAmountInCents: 4600n }));
    await fixture.processor.execute(eventInput("late-confirmed"));
    expect(fixture.attempt).toMatchObject({ status: "REFUNDED", refundedAmountInCents: 4600n });
    expect(fixture.refunds[0]?.status).toBe("CONFIRMED");
    expect(fixture.order.status).toBe("CANCELLED");
    expect(fixture.history).toHaveLength(0);
  });
});

function baseAttempt(): PaymentAttempt {
  return createPaymentAttempt({ orderId, provider: "MERCADO_PAGO", attemptNumber: 1, amountInCents: 4600n, currency: "ARS" }, now);
}

function state(overrides: Partial<ExternalPaymentState> = {}): ExternalPaymentState {
  return {
    provider: "MERCADO_PAGO", providerResourceId: "MP-1", providerStatus: "processed",
    providerStatusDetail: "accredited", externalReference: "lauril-order-10001-attempt-1",
    currency: "ARS", totalAmountInCents: 4600n, totalPaidAmountInCents: 4600n,
    approvedAt: null, rejectedAt: null, refundedAmountInCents: 0n, paymentTransactionId: "PAY-1",
    ...overrides,
  };
}

function gatewayFor(
  external: ExternalPaymentState,
  refundOrder: PaymentGateway["refundOrder"] = vi.fn().mockResolvedValue({ providerRefundId: null, providerStatus: null }),
): PaymentGateway {
  return { createCheckout: vi.fn(), getPaymentState: vi.fn(async () => external), refundOrder };
}

function eventInput(providerEventId: string) {
  return { providerEventId, providerResourceId: "MP-1", eventType: "order", action: "updated", requestId: "req", receivedAt: now } as const;
}

function webhookFixture(initialExternal: ExternalPaymentState, options: {
  status?: PaymentConfirmationOrder["status"];
  attemptStatus?: PaymentAttempt["status"];
  reservationReleasedAt?: Date | null;
  refundOrder?: PaymentGateway["refundOrder"];
} = {}) {
  let external = initialExternal;
  let attempt: PaymentAttempt = {
    ...baseAttempt(), status: options.attemptStatus ?? "PENDING", providerResourceId: "MP-1", checkoutUrl: "https://checkout.test/1",
  };
  const order: PaymentConfirmationOrder & { status: PaymentConfirmationOrder["status"] } = {
    id: orderId, number: 10001n, status: options.status ?? "PENDING_PAYMENT", currency: "ARS", totalInCents: 4600n,
    reservationReleasedAt: options.reservationReleasedAt ?? null,
    items: [{ quantity: 1, inventory: { id: "inventory-1", stockOnHand: 10, stockReserved: 1, version: 1 } }],
  };
  const events = new Map<string, PaymentEvent>();
  const refunds: PaymentRefund[] = [];
  const history: Array<{ from: string; to: string }> = [];
  let inventoryWrites = 0;
  const eventRepository: PaymentEventRepository = {
    persistIfAbsent: async (event) => {
      const current = events.get(event.providerEventId);
      if (current) return { event: current, created: false };
      events.set(event.providerEventId, event);
      return { event, created: true };
    },
    findByProviderEventId: async (_provider, id) => events.get(id) ?? null,
    finishIfPending: async (input) => {
      const current = [...events.values()].find((item) => item.id === input.id);
      if (!current || ["PROCESSED", "IGNORED"].includes(current.processingStatus)) return null;
      const next = { ...current, ...input };
      events.set(next.providerEventId, next);
      return next;
    },
  };
  const attemptRepository = { findByProviderResourceId: vi.fn(async () => attempt) } as unknown as PaymentAttemptRepository;
  const gateway = gatewayFor(external, options.refundOrder);
  const transaction: PaymentConfirmationTransaction = {
    findEvent: async (id) => [...events.values()].find((item) => item.id === id) ?? null,
    findAttempt: async (id) => id === attempt.id ? attempt : null,
    findOrder: async () => order,
    findActiveRefund: async () => refunds.find((refund) => ["CREATED", "SUBMITTED"].includes(refund.status)) ?? null,
    createRefund: async (refund) => { refunds.push(refund); },
    updateRefund: async (input) => {
      const index = refunds.findIndex((refund) => refund.id === input.id);
      refunds[index] = { ...refunds[index]!, ...input, updatedAt: now };
    },
    updateAttempt: async (input) => { attempt = { ...attempt, ...input, updatedAt: now }; },
    convertInventory: async () => { inventoryWrites += 1; return true; },
    createSaleMovement: async () => { inventoryWrites += 1; },
    markOrderPaid: async () => { order.status = "PAID"; return true; },
    createPaidHistory: async () => { history.push({ from: "PENDING_PAYMENT", to: "PAID" }); },
    transitionOrderRefund: async (input) => {
      if (order.status !== input.fromStatus) return false;
      order.status = input.toStatus;
      history.push({ from: input.fromStatus, to: input.toStatus });
      return true;
    },
    finishEvent: async (id, paymentAttemptId, processedAt) => {
      const current = [...events.values()].find((item) => item.id === id);
      if (!current || ["PROCESSED", "IGNORED"].includes(current.processingStatus)) return false;
      events.set(current.providerEventId, { ...current, processingStatus: "PROCESSED", paymentAttemptId, processedAt });
      return true;
    },
  };
  const unitOfWork: PaymentConfirmationUnitOfWork = { run: async (work) => work(transaction) };
  const processor = new ProcessMercadoPagoWebhook(attemptRepository, eventRepository, gateway, unitOfWork);
  return {
    processor, order, refunds, history,
    get attempt() { return attempt; },
    get inventoryWrites() { return inventoryWrites; },
    setExternal(value: ExternalPaymentState) { external = value; vi.mocked(gateway.getPaymentState).mockImplementation(async () => external); },
    addRefund(kind: "FULL" | "PARTIAL", amount: bigint, status: PaymentRefund["status"]) {
      refunds.push({ ...createPaymentRefund({
        paymentAttemptId: attempt.id, provider: "MERCADO_PAGO", providerResourceId: "MP-1", kind,
        amountInCents: amount, paymentTransactionId: kind === "PARTIAL" ? "PAY-1" : null,
      }, now), status });
    },
  };
}
