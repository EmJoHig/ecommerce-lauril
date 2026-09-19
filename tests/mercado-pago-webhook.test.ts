import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createPaymentAttempt, createPaymentEvent, type PaymentAttempt, type PaymentEvent } from "@/modules/payments/domain/payment";
import type { PaymentAttemptRepository } from "@/modules/payments/application/payment-attempt-repository";
import type { PaymentEventRepository } from "@/modules/payments/application/payment-event-repository";
import type { ExternalPaymentState, PaymentGateway } from "@/modules/payments/application/payment-gateway";
import type {
  PaymentConfirmationOrder,
  PaymentConfirmationTransaction,
  PaymentConfirmationUnitOfWork,
} from "@/modules/payments/application/payment-confirmation-unit-of-work";
import {
  PaymentWebhookTechnicalError,
  ProcessMercadoPagoWebhook,
} from "@/modules/payments/application/process-mercado-pago-webhook";
import { verifyMercadoPagoWebhookSignature } from "@/modules/payments/infrastructure/mercado-pago-webhook-signature";
import { handleMercadoPagoWebhook } from "@/modules/payments/presentation/mercado-pago-webhook-handler";

const now = new Date("2026-09-18T12:00:00.000Z");
const orderId = "10000000-0000-4000-8000-000000000001";
const secret = "WEBHOOK_SECRET_FOR_TESTS";

describe("Mercado Pago signed webhook", () => {
  it("valida HMAC-SHA256 con query data.id en lowercase y rechaza headers/formato/hash inválidos", () => {
    const hash = createHmac("sha256", secret)
      .update("id:abc-order-1;request-id:req-1;ts:1758196800;")
      .digest("hex");
    expect(verifyMercadoPagoWebhookSignature({
      signature: `ts=1758196800,v1=${hash}`,
      requestId: "req-1",
      dataId: "ABC-Order-1",
      secret,
    })).toBe(true);
    for (const signature of [null, "v1=abc", "ts=bad,v1=abc", `ts=1758196800,v1=${hash.slice(2)}`]) {
      expect(verifyMercadoPagoWebhookSignature({ signature, requestId: "req-1", dataId: "ABC-Order-1", secret })).toBe(false);
    }
    expect(verifyMercadoPagoWebhookSignature({ signature: `ts=1758196800,v1=${hash}`, requestId: null, dataId: "ABC-Order-1", secret })).toBe(false);
    expect(verifyMercadoPagoWebhookSignature({ signature: `ts=1758196800,v1=${hash}`, requestId: "req-1", dataId: null, secret })).toBe(false);
  });

  it("responde 401 antes de parsear/procesar cuando la firma es inválida", async () => {
    const execute = vi.fn();
    const request = webhookRequest({ signature: "ts=1758196800,v1=" + "0".repeat(64) });
    const response = await handleMercadoPagoWebhook(request, {
      enabled: true,
      secret,
      processor: { execute },
    });
    expect(response.status).toBe(401);
    expect(execute).not.toHaveBeenCalled();
  });

  it("persiste RECEIVED antes del GET y conserva PENDING para un estado esperado", async () => {
    const fixture = paymentFixture(state({ providerStatus: "processing", providerStatusDetail: "in_process", totalPaidAmountInCents: 0n }));
    const outcome = await fixture.processor.execute(input("event-pending"));
    expect(outcome.kind).toBe("pending");
    expect(fixture.calls.indexOf("persist:RECEIVED")).toBeLessThan(fixture.calls.indexOf("gateway:get"));
    expect(fixture.attempt.status).toBe("PENDING");
    expect(fixture.order.status).toBe("PENDING_PAYMENT");
    expect(fixture.movements).toHaveLength(0);
    expect(fixture.events.get("event-pending")?.processingStatus).toBe("PROCESSED");
  });

  it("deduplica un providerEventId ya PROCESSED sin repetir GET ni efectos", async () => {
    const fixture = paymentFixture(state());
    const existing = createPaymentEvent({
      provider: "MERCADO_PAGO",
      providerEventId: "event-processed",
      providerResourceId: "MP-ORDER-1",
      eventType: "order",
      action: "updated",
      requestId: "req-1",
      receivedAt: now,
    });
    fixture.events.set("event-processed", { ...existing, processingStatus: "PROCESSED", processedAt: now });
    await expect(fixture.processor.execute(input("event-processed"))).resolves.toMatchObject({ kind: "duplicate" });
    expect(fixture.gateway.getPaymentState).not.toHaveBeenCalled();
    expect(fixture.movements).toHaveLength(0);
  });

  it("clasifica rechazo y estados desconocidos sin tocar pedido ni stock", async () => {
    for (const { external, expected } of [
      { external: state({ providerStatus: "failed", providerStatusDetail: "rejected", totalPaidAmountInCents: 0n }), expected: "REJECTED" },
      { external: state({ providerStatus: "processed", providerStatusDetail: "partially_refunded" }), expected: "REQUIRES_REVIEW" },
      { external: state({ providerStatus: "unexpected", providerStatusDetail: null }), expected: "REQUIRES_REVIEW" },
    ]) {
      const fixture = paymentFixture(external);
      await fixture.processor.execute(input(`event-${external.providerStatus}-${external.providerStatusDetail}`));
      expect(fixture.attempt.status).toBe(expected);
      expect(fixture.order.status).toBe("PENDING_PAYMENT");
      expect(fixture.inventory()).toMatchObject({ stockOnHand: 100, stockReserved: 5 });
      expect(fixture.movements).toHaveLength(0);
    }
  });

  it("confirma processed/accredited en una unidad atómica con PAID, SALE, historial, APPROVED y evento", async () => {
    const fixture = paymentFixture(state());
    const outcome = await fixture.processor.execute(input("event-approved"));
    expect(outcome).toMatchObject({ kind: "approved", orderNumber: 10001n });
    expect(fixture.order.status).toBe("PAID");
    expect(fixture.inventory()).toMatchObject({ stockOnHand: 98, stockReserved: 3, version: 8 });
    expect(fixture.movements).toEqual([expect.objectContaining({
      type: "SALE", quantity: -2, stockBefore: 100, stockAfter: 98,
      referenceType: "ORDER", referenceId: orderId, adminUserId: null,
    })]);
    expect(fixture.history).toEqual([expect.objectContaining({ fromStatus: "PENDING_PAYMENT", toStatus: "PAID", actorUserId: null })]);
    expect(fixture.attempt).toMatchObject({ status: "APPROVED", providerStatus: "processed", providerStatusDetail: "accredited", approvedAt: now, rejectedAt: null });
    expect(fixture.events.get("event-approved")).toMatchObject({ processingStatus: "PROCESSED", paymentAttemptId: fixture.attempt.id });
  });

  it("envía a revisión inconsistencias de recurso, referencia, moneda, monto o total pagado", async () => {
    const mismatches = [
      state({ providerResourceId: "OTHER" }),
      state({ externalReference: "wrong-reference" }),
      state({ currency: "USD" }),
      state({ totalAmountInCents: 999n }),
      state({ totalPaidAmountInCents: 999n }),
    ];
    for (const [index, external] of mismatches.entries()) {
      const fixture = paymentFixture(external);
      await expect(fixture.processor.execute(input(`event-mismatch-${index}`))).resolves.toMatchObject({ kind: "requires_review" });
      expect(fixture.attempt.status).toBe("REQUIRES_REVIEW");
      expect(fixture.order.status).toBe("PENDING_PAYMENT");
      expect(fixture.movements).toHaveLength(0);
    }
  });

  it("trata pago tardío, reserva liberada o reserva insuficiente como revisión sin venta", async () => {
    const cases = [
      { status: "CANCELLED" as const, reservationReleasedAt: now, stockReserved: 3 },
      { status: "PENDING_PAYMENT" as const, reservationReleasedAt: now, stockReserved: 3 },
      { status: "PENDING_PAYMENT" as const, reservationReleasedAt: null, stockReserved: 1 },
    ];
    for (const [index, item] of cases.entries()) {
      const fixture = paymentFixture(state(), item);
      await expect(fixture.processor.execute(input(`event-late-${index}`))).resolves.toMatchObject({ kind: "requires_review" });
      expect(fixture.order.status).toBe(item.status);
      expect(fixture.movements).toHaveLength(0);
    }
  });

  it("dos eventos válidos del mismo recurso producen una sola venta", async () => {
    const fixture = paymentFixture(state());
    await expect(fixture.processor.execute(input("event-one"))).resolves.toMatchObject({ kind: "approved" });
    await expect(fixture.processor.execute(input("event-two"))).resolves.toMatchObject({ kind: "duplicate" });
    expect(fixture.movements).toHaveLength(1);
    expect(fixture.inventory()).toMatchObject({ stockOnHand: 98, stockReserved: 3 });
    expect(fixture.events.get("event-two")?.processingStatus).toBe("PROCESSED");
  });

  it("marca FAILED y propaga 5xx técnico ante fallo de GET o de transacción sin efectos parciales", async () => {
    const gatewayFailure = paymentFixture(state());
    vi.mocked(gatewayFailure.gateway.getPaymentState).mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(gatewayFailure.processor.execute(input("event-get-failed"))).rejects.toBeInstanceOf(PaymentWebhookTechnicalError);
    expect(gatewayFailure.events.get("event-get-failed")?.processingStatus).toBe("FAILED");
    expect(gatewayFailure.movements).toHaveLength(0);

    const transactionFailure = paymentFixture(state(), {}, true);
    await expect(transactionFailure.processor.execute(input("event-tx-failed"))).rejects.toBeInstanceOf(PaymentWebhookTechnicalError);
    expect(transactionFailure.events.get("event-tx-failed")?.processingStatus).toBe("FAILED");
    expect(transactionFailure.order.status).toBe("PENDING_PAYMENT");
    expect(transactionFailure.movements).toHaveLength(0);
  });
});

function input(providerEventId: string) {
  return {
    providerEventId,
    providerResourceId: "MP-ORDER-1",
    eventType: "order",
    action: "updated",
    requestId: "req-1",
    receivedAt: now,
  } as const;
}

function state(overrides: Partial<ExternalPaymentState> = {}): ExternalPaymentState {
  return {
    provider: "MERCADO_PAGO",
    providerResourceId: "MP-ORDER-1",
    providerStatus: "processed",
    providerStatusDetail: "accredited",
    externalReference: "lauril-order-10001-attempt-1",
    currency: "ARS",
    totalAmountInCents: 4600n,
    totalPaidAmountInCents: 4600n,
    approvedAt: null,
    rejectedAt: null,
    refundedAmountInCents: 0n,
    paymentTransactionId: null,
    ...overrides,
  };
}

function webhookRequest(options: { signature: string }): Request {
  return new Request("https://lauril.test/api/payments/mercado-pago/webhook?data.id=MP-ORDER-1&type=order", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": "req-1",
      "x-signature": options.signature,
    },
    body: JSON.stringify({ id: "event-1", action: "updated", type: "order", data: { id: "MP-ORDER-1" } }),
  });
}

function paymentFixture(
  external: ExternalPaymentState,
  orderOverrides: Partial<Pick<PaymentConfirmationOrder, "status" | "reservationReleasedAt">> & { stockReserved?: number } = {},
  failTransaction = false,
) {
  const calls: string[] = [];
  const events = new Map<string, PaymentEvent>();
  let attempt: PaymentAttempt = {
    ...createPaymentAttempt({ orderId, provider: "MERCADO_PAGO", attemptNumber: 1, amountInCents: 4600n, currency: "ARS" }, now),
    status: "PENDING",
    providerResourceId: "MP-ORDER-1",
    checkoutUrl: "https://checkout.example.test/1",
  };
  let inventory = { id: "inventory-1", stockOnHand: 100, stockReserved: orderOverrides.stockReserved ?? 5, version: 7 };
  const order: { status: PaymentConfirmationOrder["status"]; reservationReleasedAt: Date | null } & Omit<PaymentConfirmationOrder, "status" | "reservationReleasedAt" | "items"> & { items: Array<{ quantity: number; inventory: typeof inventory | null }> } = {
    id: orderId,
    number: 10001n,
    status: orderOverrides.status ?? "PENDING_PAYMENT",
    currency: "ARS",
    totalInCents: 4600n,
    reservationReleasedAt: orderOverrides.reservationReleasedAt ?? null,
    items: [{ quantity: 2, inventory }],
  };
  const movements: Array<Record<string, unknown>> = [];
  const history: Array<Record<string, unknown>> = [];

  const eventRepository: PaymentEventRepository = {
    persistIfAbsent: async (event) => {
      const existing = events.get(event.providerEventId);
      if (existing) return { event: existing, created: false };
      events.set(event.providerEventId, event);
      calls.push(`persist:${event.processingStatus}`);
      return { event, created: true };
    },
    findByProviderEventId: async (_provider, providerEventId) => events.get(providerEventId) ?? null,
    finishIfPending: async (update) => {
      const current = [...events.values()].find((event) => event.id === update.id);
      if (!current || ["PROCESSED", "IGNORED"].includes(current.processingStatus)) return null;
      const next = { ...current, ...update };
      events.set(next.providerEventId, next);
      return next;
    },
  };
  const attemptRepository = {
    findByProviderResourceId: vi.fn(async () => attempt),
  } as unknown as PaymentAttemptRepository;
  const gateway = {
    createCheckout: vi.fn(),
    getPaymentState: vi.fn(async () => { calls.push("gateway:get"); return external; }),
    refundOrder: vi.fn(),
  } satisfies PaymentGateway;

  const transaction: PaymentConfirmationTransaction = {
    findEvent: async (id) => [...events.values()].find((event) => event.id === id) ?? null,
    findAttempt: async (id) => attempt.id === id ? attempt : null,
    findActiveRefund: async () => null,
    createRefund: async () => undefined,
    updateRefund: async () => undefined,
    findOrder: async (id) => order.id === id ? order : null,
    updateAttempt: async (update) => { attempt = { ...attempt, ...update, updatedAt: now }; },
    convertInventory: async (update) => {
      if (inventory.id !== update.id || inventory.version !== update.expectedVersion) return false;
      inventory = { ...inventory, stockOnHand: update.stockOnHand, stockReserved: update.stockReserved, version: inventory.version + 1 };
      order.items[0]!.inventory = inventory;
      return true;
    },
    createSaleMovement: async (sale) => {
      if (movements.some((movement) => movement.inventoryId === sale.inventoryId && movement.referenceId === sale.orderId)) {
        throw Object.assign(new Error("duplicate sale"), { code: "P2002" });
      }
      movements.push({
        ...sale,
        type: "SALE",
        referenceType: "ORDER",
        referenceId: sale.orderId,
        adminUserId: null,
      });
    },
    markOrderPaid: async (id) => {
      if (order.id !== id || order.status !== "PENDING_PAYMENT" || order.reservationReleasedAt) return false;
      order.status = "PAID";
      return true;
    },
    createPaidHistory: async (id, createdAt) => {
      history.push({ orderId: id, fromStatus: "PENDING_PAYMENT", toStatus: "PAID", actorUserId: null, createdAt });
    },
    transitionOrderRefund: async () => true,
    finishEvent: async (eventId, attemptId, processedAt) => {
      const current = [...events.values()].find((event) => event.id === eventId);
      if (!current || ["PROCESSED", "IGNORED"].includes(current.processingStatus)) return false;
      events.set(current.providerEventId, { ...current, processingStatus: "PROCESSED", paymentAttemptId: attemptId, processedAt });
      return true;
    },
  };
  const unitOfWork: PaymentConfirmationUnitOfWork = {
    run: async (work) => {
      if (failTransaction) throw new Error("transaction unavailable");
      return work(transaction);
    },
  };
  const processor = new ProcessMercadoPagoWebhook(attemptRepository, eventRepository, gateway, unitOfWork);
  return {
    processor,
    calls,
    events,
    gateway,
    get attempt() { return attempt; },
    order,
    movements,
    history,
    inventory: () => inventory,
  };
}
