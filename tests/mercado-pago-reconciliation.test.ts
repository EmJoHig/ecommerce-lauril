import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { ConflictError } from "@/shared/domain/errors";
import { CheckoutService } from "@/modules/orders/application/checkout-service";
import { PrismaOrderRepository } from "@/modules/orders/infrastructure/prisma-order-repository";
import { FinalizeMercadoPagoPayment } from "@/modules/payments/application/finalize-mercado-pago-payment";
import { ReconcileMercadoPagoPayments } from "@/modules/payments/application/reconcile-mercado-pago-payments";
import { PrismaPaymentConfirmationUnitOfWork } from "@/modules/payments/infrastructure/prisma-payment-confirmation-unit-of-work";
import { PrismaPaymentReconciliationCheckpointRepository } from "@/modules/payments/infrastructure/prisma-payment-reconciliation-checkpoint-repository";
import { PaymentGatewayError } from "@/modules/payments/infrastructure/mercado-pago-orders-gateway";
import { authoritative, deferred, now, paymentRaceFixture, webhookInput } from "./helpers/payment-race-fixture";

const runAt = new Date(now.getTime() + 10 * 60_000);
const pending = authoritative({ providerStatus: "processing", providerStatusDetail: "in_process", totalPaidAmountInCents: 0n });

async function fixture() {
  const f = paymentRaceFixture(runAt);
  await f.start();
  f.client.paymentAttempt.rows[0]!.updatedAt = now;
  const finalizer = new FinalizeMercadoPagoPayment(f.gateway,
    new PrismaPaymentConfirmationUnitOfWork(f.client as unknown as PrismaClient));
  const log = vi.fn();
  const checkpoints = new PrismaPaymentReconciliationCheckpointRepository(f.client as unknown as PrismaClient);
  const newReconciler = () => new ReconcileMercadoPagoPayments(f.attempts, f.gateway, finalizer,
    new PrismaPaymentReconciliationCheckpointRepository(f.client as unknown as PrismaClient), log);
  const reconciler = newReconciler();
  return { ...f, f, finalizer, log, checkpoints, newReconciler, reconciler, run: () => reconciler.execute(runAt) };
}

function expectSale(f: ReturnType<typeof paymentRaceFixture>) {
  expect(f.attempt.status).toBe("APPROVED");
  expect(f.order.status).toBe("PAID");
  expect(f.sales).toHaveLength(1);
  expect(f.inventory).toMatchObject({ stockOnHand: 98, stockReserved: 3, version: 8 });
  expect(f.client.orderStatusHistory.rows).toHaveLength(1);
}

function missingResourceCandidates(f: ReturnType<typeof paymentRaceFixture>, count: number) {
  const template = structuredClone(f.attempt);
  f.client.paymentAttempt.rows.splice(0);
  for (let i = 0; i < count; i++) f.client.paymentAttempt.rows.push({
    ...template, id: String(i).padStart(3, "0"), providerResourceId: null,
    orderId: `missing-order-${i}`, idempotencyKey: `missing-key-${i}`,
  });
}

describe("Mercado Pago reconciliation", () => {
  it.each([
    ["APPROVED", authoritative(), "reconciled"],
    ["PENDING", pending, "unchanged"],
    ["REJECTED", authoritative({ providerStatus: "failed", providerStatusDetail: "rejected" }), "reconciled"],
    ["CANCELLED", authoritative({ providerStatus: "canceled", providerStatusDetail: "canceled" }), "reconciled"],
  ] as const)("PENDING local + %s remoto", async (status, external, counter) => {
    const { f, run } = await fixture();
    f.gateway.getPaymentState.mockResolvedValue(external);
    expect(await run()).toMatchObject({ scanned: 1, [counter]: 1, failed: 0 });
    expect(f.gateway.getPaymentState).toHaveBeenCalledExactlyOnceWith("MP-RACE-1");
    expect(f.attempt.status).toBe(status);
    if (status === "APPROVED") expectSale(f);
    else {
      expect(f.order.status).toBe("PENDING_PAYMENT");
      expect(f.sales).toHaveLength(0);
      expect(f.inventory).toMatchObject({ stockOnHand: 100, stockReserved: 5, version: 7 });
    }
    expect(f.client.paymentEvent.rows).toHaveLength(0);
  });

  it("CREATED sin recurso: skip sin consulta, evento ni mutación", async () => {
    const { f, run, log } = await fixture();
    Object.assign(f.client.paymentAttempt.rows[0]!, { status: "CREATED", providerResourceId: null });
    const before = structuredClone(f.attempt);
    expect(await run()).toMatchObject({ scanned: 1, skipped: 1 });
    expect(f.attempt).toEqual(before);
    expect(f.gateway.getPaymentState).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith({ source: "reconciliation", paymentAttemptId: f.attempt.id,
      outcome: "skipped", reasonCode: "missing_provider_resource" });
  });

  it.each([
    [{ externalReference: "wrong" }, "external_reference_mismatch"],
    [{ currency: "USD" }, "currency_mismatch"],
    [{ totalAmountInCents: 4599n }, "total_amount_mismatch"],
    [{ totalPaidAmountInCents: 4599n }, "paid_amount_mismatch"],
    [{ providerResourceId: "wrong" }, "provider_resource_mismatch"],
  ])("integridad %# conserva reglas comunes", async (overrides, reasonCode) => {
    const { f, run, log } = await fixture();
    f.gateway.getPaymentState.mockResolvedValue(authoritative(overrides));
    expect(await run()).toMatchObject({ requiresReview: 1 });
    expect(f.attempt.status).toBe("REQUIRES_REVIEW");
    expect(f.order.status).toBe("PENDING_PAYMENT");
    expect(f.sales).toHaveLength(0);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ reasonCode }));
  });

  it("corrida repetida no consulta nuevamente ni duplica SALE", async () => {
    const { f, run } = await fixture();
    await run();
    expect(await run()).toMatchObject({ scanned: 0 });
    expect(f.gateway.getPaymentState).toHaveBeenCalledTimes(1);
    expectSale(f);
  });

  it("A: GET pendiente bloqueado, webhook aprueba, reconciliador termina sin degradar", async () => {
    const { f, run } = await fixture();
    const entered = deferred<void>(), response = deferred<ReturnType<typeof authoritative>>();
    f.gateway.getPaymentState.mockImplementationOnce(() => { entered.resolve(); return response.promise; });
    const running = run();
    await entered.promise;
    expect(await f.webhook.execute(webhookInput("race-A"))).toMatchObject({ kind: "approved" });
    response.resolve(pending);
    expect(await running).toMatchObject({ skipped: 1 });
    expectSale(f);
  });

  it("B: reconciliador aprueba antes de que termine webhook concurrente", async () => {
    const { f, run } = await fixture();
    const entered = deferred<void>(), response = deferred<ReturnType<typeof authoritative>>();
    f.gateway.getPaymentState.mockImplementationOnce(() => { entered.resolve(); return response.promise; });
    const webhook = f.webhook.execute(webhookInput("race-B"));
    await entered.promise;
    expect(await run()).toMatchObject({ reconciled: 1 });
    response.resolve(authoritative());
    expect(await webhook).toMatchObject({ kind: "duplicate" });
    expectSale(f);
  });

  it("C: dos reconciliadores concurrentes sólo efectúan una transición", async () => {
    const { f, run } = await fixture();
    const entered = deferred<void>(), response = deferred<ReturnType<typeof authoritative>>();
    f.gateway.getPaymentState.mockImplementation(() => {
      if (f.gateway.getPaymentState.mock.calls.length === 2) entered.resolve();
      return response.promise;
    });
    const first = run(), second = run();
    await entered.promise;
    response.resolve(authoritative());
    const results = await Promise.all([first, second]);
    expect(results.map((r) => r.reconciled).sort()).toEqual([0, 1]);
    expect(results.map((r) => r.skipped).sort()).toEqual([0, 1]);
    expectSale(f);
  });

  it("candidato actualizado aún PENDING durante GET descarta snapshot obsoleto", async () => {
    const { f, run } = await fixture();
    f.gateway.getPaymentState.mockImplementationOnce(async () => {
      await f.client.paymentAttempt.update({ where: { id: f.attempt.id }, data: { providerStatus: "processing" } });
      return authoritative();
    });
    expect(await run()).toMatchObject({ skipped: 1 });
    expect(f.attempt.status).toBe("PENDING");
    expect(f.sales).toHaveLength(0);
  });

  it("Order PAID con intento PENDING usa revisión existente, sin segunda venta", async () => {
    const { f, run } = await fixture();
    f.order.status = "PAID";
    expect(await run()).toMatchObject({ requiresReview: 1 });
    expect(f.attempt.status).toBe("REQUIRES_REVIEW");
    expect(f.order.status).toBe("PAID");
    expect(f.sales).toHaveLength(0);
  });

  it("Order CANCELLED + pago tardío prepara mismo FULL idempotente sin venta", async () => {
    const { f, run } = await fixture();
    Object.assign(f.order, { status: "CANCELLED", reservationReleasedAt: now });
    f.inventory.stockReserved = 0;
    f.gateway.refundOrder.mockResolvedValue({ providerRefundId: "refund-1", providerStatus: "processed" });
    expect(await run()).toMatchObject({ requiresReview: 1 });
    const refund = f.client.paymentRefund.rows[0]!;
    expect(refund).toMatchObject({ kind: "FULL", status: "SUBMITTED", amountInCents: 4600n });
    expect(f.gateway.refundOrder).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: refund.idempotencyKey }));
    expect(await run()).toMatchObject({ scanned: 0 });
    expect(f.gateway.refundOrder).toHaveBeenCalledTimes(1);
    expect(f.order.status).toBe("CANCELLED");
    expect(f.sales).toHaveLength(0);
    expect(f.inventory).toMatchObject({ stockOnHand: 100, stockReserved: 0 });
  });

  it.each(["TIMEOUT", "INVALID_REQUEST"] as const)("auto-refund %s preserva revisión e idempotencia", async (code) => {
    const { f, run } = await fixture();
    Object.assign(f.order, { status: "CANCELLED", reservationReleasedAt: now });
    f.gateway.refundOrder.mockRejectedValue(new PaymentGatewayError(code, "safe test"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await run()).toMatchObject(code === "TIMEOUT" ? { failed: 1, status: "partial" } : { requiresReview: 1 });
      expect(f.attempt.status).toBe("REQUIRES_REVIEW");
      expect(f.client.paymentRefund.rows[0]!.status).toBe(code === "TIMEOUT" ? "CREATED" : "REQUIRES_REVIEW");
      expect(f.sales).toHaveLength(0);
    } finally { warn.mockRestore(); }
  });

  it.each([false, true])("refund remoto total=%s usa finalización existente sin restock", async (full) => {
    const { f, run } = await fixture();
    f.order.status = "PAID";
    f.gateway.getPaymentState.mockResolvedValue(authoritative({
      providerStatusDetail: full ? "refunded" : "partially_refunded", refundedAmountInCents: full ? 4600n : 100n,
    }));
    expect(await run()).toMatchObject({ reconciled: 1 });
    expect(f.order.status).toBe(full ? "REFUNDED" : "PARTIALLY_REFUNDED");
    expect(f.attempt.status).toBe(f.order.status);
    expect(f.sales).toHaveLength(0);
    expect(f.inventory).toMatchObject({ stockOnHand: 100, stockReserved: 5 });
  });

  it("provider error por intento continúa con el siguiente candidato", async () => {
    const { f, run } = await fixture();
    f.client.paymentAttempt.rows.push({ ...structuredClone(f.attempt), id: "zz-second", idempotencyKey: "second-key", orderId: "missing-order", providerResourceId: "MP-2" });
    f.gateway.getPaymentState.mockRejectedValueOnce(new PaymentGatewayError("TIMEOUT", "must not log"));
    expect(await run()).toMatchObject({ scanned: 2, failed: 1, requiresReview: 1, status: "partial" });
    expect(f.attempt.status).toBe("PENDING");
    expect(f.gateway.getPaymentState).toHaveBeenCalledTimes(2);
  });

  it("conflicto de un intento permite continuar", async () => {
    const { f, run, finalizer } = await fixture();
    f.client.paymentAttempt.rows.push({ ...structuredClone(f.attempt), id: "zz-second", idempotencyKey: "second-key", orderId: "missing-order", providerResourceId: "MP-2" });
    vi.spyOn(finalizer, "execute").mockRejectedValueOnce(new ConflictError("test conflict"));
    expect(await run()).toMatchObject({ scanned: 2, failed: 1, requiresReview: 1 });
  });

  it.each(["AUTHENTICATION", "RATE_LIMITED"] as const)("%s detiene corrida sin bombardear provider", async (code) => {
    const { f, run } = await fixture();
    f.gateway.getPaymentState.mockRejectedValue(new PaymentGatewayError(code, "secret must not appear"));
    await expect(run()).rejects.toMatchObject({ code });
    expect(f.gateway.getPaymentState).toHaveBeenCalledTimes(1);
  });

  it("fallo global de DB se propaga", async () => {
    const { f, run } = await fixture();
    f.client.paymentAttempt.findMany.mockRejectedValue(new Error("DB unavailable"));
    await expect(run()).rejects.toThrow("DB unavailable");
    expect(f.gateway.getPaymentState).not.toHaveBeenCalled();
  });

  it("paginas de 25, máximo 100, orden estable y cursor permite continuar sin mutar skips", async () => {
    const { f, run, reconciler } = await fixture();
    const template = structuredClone(f.attempt);
    f.client.paymentAttempt.rows.splice(0);
    for (let i = 104; i >= 0; i--) f.client.paymentAttempt.rows.push({
      ...template, id: String(i).padStart(3, "0"), providerResourceId: null,
    });
    const result = await run();
    expect(result).toMatchObject({ scanned: 100, skipped: 100, nextCursor: { id: "099", updatedAt: now } });
    expect(f.client.paymentAttempt.findMany).toHaveBeenCalledTimes(4);
    for (const [query] of f.client.paymentAttempt.findMany.mock.calls) expect(query.take).toBe(25);
    expect(await reconciler.execute(runAt)).toMatchObject({ scanned: 5, skipped: 5, nextCursor: null, cycleCompleted: true });
    expect(f.gateway.getPaymentState).not.toHaveBeenCalled();
  });

  it("filtro real excluye terminales, revisión, otro proveedor y candidatos recientes", async () => {
    const { f, run } = await fixture();
    const template = structuredClone(f.attempt);
    f.client.paymentAttempt.rows.splice(0);
    for (const status of ["APPROVED", "REJECTED", "CANCELLED", "REFUNDED", "PARTIALLY_REFUNDED", "REQUIRES_REVIEW"]) {
      f.client.paymentAttempt.rows.push({ ...template, id: status, status });
    }
    f.client.paymentAttempt.rows.push({ ...template, id: "recent", updatedAt: new Date(runAt.getTime() - 5 * 60_000) });
    f.client.paymentAttempt.rows.push({ ...template, id: "other-provider", provider: "OTHER" });
    expect(await run()).toMatchObject({ scanned: 0 });
    expect(f.gateway.getPaymentState).not.toHaveBeenCalled();
  });

  it("150 candidatos: checkpoint entre procesos alcanza 50 APPROVED tras 100 errores y nuevo ciclo reintenta fallidos", async () => {
    const { f, run, newReconciler, checkpoints } = await fixture();
    const attempt = structuredClone(f.attempt), order = structuredClone(f.order);
    f.client.paymentAttempt.rows.splice(0);
    f.client.order.rows.splice(0);
    Object.assign(f.inventory, { stockOnHand: 1000, stockReserved: 300 });
    for (let index = 0; index < 150; index++) {
      const id = String(index).padStart(3, "0");
      f.client.paymentAttempt.rows.push({ ...attempt, id, orderId: id,
        idempotencyKey: `key-${id}`, providerResourceId: `MP-${id}` });
      f.client.order.rows.push({ ...order, id, number: 10001n + BigInt(index) });
    }
    f.gateway.getPaymentState.mockImplementation(async (resource) => {
      const index = Number(resource.slice(3));
      if (index < 100) throw new PaymentGatewayError("NOT_FOUND", "permanent test failure");
      return authoritative({ providerResourceId: resource, externalReference: `lauril-order-${10001 + index}-attempt-1` });
    });
    const first = await run();
    expect(first).toMatchObject({ scanned: 100, failed: 100, reconciled: 0 });
    expect(await checkpoints.get()).toMatchObject({ cursor: { id: "099" }, version: 100 });
    expect(await newReconciler().execute(new Date(runAt.getTime() + 10 * 60_000)))
      .toMatchObject({ scanned: 50, failed: 0, reconciled: 50, cycleCompleted: true, cycleCutoff: first.cycleCutoff });
    const requested = f.gateway.getPaymentState.mock.calls.map(([id]) => id);
    expect(requested.slice(100)).toEqual(Array.from({ length: 50 }, (_, i) => `MP-${100 + i}`));
    expect(f.client.paymentAttempt.rows.slice(100).every((row) => row.status === "APPROVED")).toBe(true);
    expect(f.sales).toHaveLength(50);
    expect(await checkpoints.get()).toMatchObject({ cycleCutoff: null, cursor: null, version: 151 });
    expect(await newReconciler().execute(new Date(runAt.getTime() + 20 * 60_000)))
      .toMatchObject({ scanned: 100, failed: 100, reconciled: 0, cycleCompleted: false });
    expect(f.gateway.getPaymentState.mock.calls.slice(150).map(([id]) => id)).toEqual(requested.slice(0, 100));
    expect(f.sales).toHaveLength(50);
  });

  it("paginación multipágina ordena timestamp/id sin duplicados ni saltos", async () => {
    const { f, run, log } = await fixture();
    const template = structuredClone(f.attempt);
    f.client.paymentAttempt.rows.splice(0);
    for (let index = 59; index >= 0; index--) f.client.paymentAttempt.rows.push({
      ...template, id: String(index).padStart(3, "0"), providerResourceId: null,
      updatedAt: new Date(now.getTime() + (index % 3) * 1000),
    });
    const expected = [...f.client.paymentAttempt.rows].sort((a, b) =>
      +(a.updatedAt as Date) - +(b.updatedAt as Date) || String(a.id).localeCompare(String(b.id))).map((row) => row.id);
    expect(await run()).toMatchObject({ scanned: 60, skipped: 60 });
    const processed = log.mock.calls.map(([entry]) => entry.paymentAttemptId);
    expect(processed).toEqual(expected);
    expect(new Set(processed).size).toBe(60);
    const calls = f.client.paymentAttempt.findMany.mock.calls;
    expect(calls[1]![0].where).toMatchObject({ OR: [
      { updatedAt: { gt: f.client.paymentAttempt.rows.find((row) => row.id === expected[24])!.updatedAt } },
      { updatedAt: f.client.paymentAttempt.rows.find((row) => row.id === expected[24])!.updatedAt, id: { gt: expected[24] } },
    ] });
  });

  it.each(["NOT_FOUND", "UNAVAILABLE", "TIMEOUT", "NETWORK"] as const)("GET %s falla sin mutar intento y se reintenta en próxima corrida", async (code) => {
    const { f, run } = await fixture();
    const before = structuredClone(f.attempt);
    f.gateway.getPaymentState.mockRejectedValue(new PaymentGatewayError(code, "test provider error"));
    expect(await run()).toMatchObject({ failed: 1, status: "partial" });
    expect(f.attempt).toEqual(before);
    expect(await run()).toMatchObject({ failed: 1, status: "partial" });
    expect(f.gateway.getPaymentState).toHaveBeenCalledTimes(2);
  });

  it("misma precisión temporal: webhook APPROVED impide sobrescritura aunque updatedAt coincida", async () => {
    const { f, run } = await fixture();
    const previous = f.attempt.updatedAt;
    f.gateway.getPaymentState.mockImplementationOnce(async () => {
      await f.webhook.execute(webhookInput("same-millisecond"));
      f.client.paymentAttempt.rows[0]!.updatedAt = previous;
      return pending;
    });
    expect(await run()).toMatchObject({ skipped: 1 });
    expectSale(f);
  });

  it.each(["order-cas", "inventory-version", "sale-unique"] as const)("%s fallido revierte todos los efectos transaccionales", async (failure) => {
    const { f, run } = await fixture();
    if (failure === "order-cas") f.client.order.updateMany.mockResolvedValue({ count: 0 });
    if (failure === "inventory-version") f.client.inventory.updateMany.mockResolvedValue({ count: 0 });
    if (failure === "sale-unique") f.client.inventoryMovement.create.mockRejectedValue(
      Object.assign(new Error("unique test conflict"), { code: "P2002" }));
    expect(await run()).toMatchObject({ failed: 1, reconciled: 0 });
    expect(f.attempt.status).toBe("PENDING");
    expect(f.order.status).toBe("PENDING_PAYMENT");
    expect(f.inventory).toMatchObject({ stockOnHand: 100, stockReserved: 5, version: 7 });
    expect(f.sales).toHaveLength(0);
    expect(f.client.orderStatusHistory.rows).toHaveLength(0);
  });

  it.each(["reconcile-first", "expire-first"] as const)("expiración real %s conserva stock y transiciones", async (sequence) => {
    const { f, run } = await fixture();
    const expiry = new CheckoutService(new PrismaOrderRepository(f.client as unknown as PrismaClient), {
      quoteAll: vi.fn().mockRejectedValue(new Error("shipping must not be called")),
      quote: vi.fn().mockRejectedValue(new Error("shipping must not be called")),
    });
    f.gateway.refundOrder.mockResolvedValue({ providerRefundId: "late-refund", providerStatus: "processed" });
    if (sequence === "reconcile-first") {
      expect(await run()).toMatchObject({ reconciled: 1 });
      expect(await expiry.expirePendingOrder(String(f.order.id), runAt)).toBe(false);
      expectSale(f);
    } else {
      expect(await expiry.expirePendingOrder(String(f.order.id), runAt)).toBe(true);
      expect(f.order).toMatchObject({ status: "CANCELLED", reservationReleasedAt: runAt });
      expect(f.inventory).toMatchObject({ stockOnHand: 100, stockReserved: 3 });
      expect(await run()).toMatchObject({ requiresReview: 1 });
      expect(f.gateway.refundOrder).toHaveBeenCalledOnce();
      expect(f.sales).toHaveLength(0);
      expect(f.order.status).toBe("CANCELLED");
      expect(f.inventory).toMatchObject({ stockOnHand: 100, stockReserved: 3 });
    }
  });

  it("primera creación concurrente usa una única identidad y conserva cutoff original", async () => {
    const { f, checkpoints } = await fixture();
    const cutoff = new Date(runAt.getTime() - 5 * 60_000);
    const other = new PrismaPaymentReconciliationCheckpointRepository(f.client as unknown as PrismaClient);
    const results = await Promise.all([checkpoints.getOrCreate(cutoff), other.getOrCreate(new Date(runAt))]);
    expect(f.client.paymentReconciliationCheckpoint.rows).toHaveLength(1);
    expect(results).toEqual([
      { cycleCutoff: cutoff, cursor: null, version: 0 },
      { cycleCutoff: cutoff, cursor: null, version: 0 },
    ]);
    expect(await other.getOrCreate(new Date(runAt))).toEqual(results[0]);
  });

  it("candidato nuevo espera próximo ciclo aunque envejezca durante el ciclo abierto", async () => {
    const { f, run, newReconciler, log } = await fixture();
    missingResourceCandidates(f, 101);
    const first = await run();
    f.client.paymentAttempt.rows.push({ ...f.client.paymentAttempt.rows[100], id: "new", updatedAt: runAt });
    log.mockClear();
    const later = new Date(runAt.getTime() + 10 * 60_000);
    expect(await newReconciler().execute(later)).toMatchObject({
      scanned: 1, cycleCompleted: true, cycleCutoff: first.cycleCutoff,
    });
    expect(log.mock.calls.map(([entry]) => entry.paymentAttemptId)).toEqual(["100"]);
    expect(await newReconciler().execute(later)).toMatchObject({ scanned: 100, cycleCompleted: false,
      cycleCutoff: new Date(later.getTime() - 5 * 60_000) });
    log.mockClear();
    expect(await newReconciler().execute(later)).toMatchObject({ scanned: 2, cycleCompleted: true });
    expect(log.mock.calls.map(([entry]) => entry.paymentAttemptId)).toEqual(["100", "new"]);
  });

  it("actualización real de candidato posterior al cursor lo difiere al siguiente ciclo", async () => {
    const { f, run, newReconciler, log } = await fixture();
    const original = structuredClone(f.attempt);
    missingResourceCandidates(f, 100);
    f.client.paymentAttempt.rows.push({ ...original, id: "later" });
    await run();
    // Exercise the existing snapshot writer: no artificial timestamp writes.
    await f.attempts.updateSnapshot({ ...original, id: "later", status: "PENDING" });
    const later = new Date(runAt.getTime() + 10 * 60_000);
    log.mockClear();
    expect(await newReconciler().execute(later)).toMatchObject({ scanned: 0, cycleCompleted: true });
    expect(f.gateway.getPaymentState).not.toHaveBeenCalled();
    await newReconciler().execute(later);
    expect(await newReconciler().execute(later)).toMatchObject({ scanned: 1, reconciled: 1, cycleCompleted: true });
    expect(f.client.paymentAttempt.rows.find((row) => row.id === "later")!.status).toBe("APPROVED");
    expect(f.sales).toHaveLength(1);
  });

  it("CAS perdido relee checkpoint, termina y no retrocede ni consulta siguiente registro", async () => {
    const { f, run, checkpoints, newReconciler } = await fixture();
    missingResourceCandidates(f, 150);
    const table = f.client.paymentReconciliationCheckpoint;
    const write = table.updateMany.getMockImplementation()!;
    const entered = deferred<void>(), resume = deferred<void>();
    table.updateMany.mockImplementationOnce(async (query) => {
      entered.resolve();
      await resume.promise;
      return write(query);
    });
    const stale = run();
    await entered.promise;
    expect(await newReconciler().execute(runAt)).toMatchObject({ scanned: 100, checkpointAdvanced: true });
    const winner = await checkpoints.get();
    expect(winner).toMatchObject({ version: 100, cursor: { id: "099" } });
    resume.resolve();
    expect(await stale).toMatchObject({ scanned: 1, checkpointConflict: true, checkpointAdvanced: false, checkpointVersion: 100 });
    expect(await checkpoints.get()).toEqual(winner);
    expect(table.findUniqueOrThrow).toHaveBeenCalled();
    expect(await newReconciler().execute(runAt)).toMatchObject({ scanned: 50, cycleCompleted: true });
  });

  it("proceso del ciclo anterior no puede reabrir ni retroceder el ciclo siguiente", async () => {
    const { f, checkpoints } = await fixture();
    const first = await checkpoints.getOrCreate(now);
    expect(await checkpoints.compareAndSet(first.version, { cycleCutoff: null, cursor: null })).toBe(true);
    expect(await checkpoints.compareAndSet(first.version + 1, { cycleCutoff: runAt, cursor: null })).toBe(true);
    expect(await checkpoints.compareAndSet(first.version, { cycleCutoff: now, cursor: { updatedAt: now, id: f.attempt.id } })).toBe(false);
    expect(await checkpoints.get()).toEqual({ cycleCutoff: runAt, cursor: null, version: 2 });
  });

  it("crash después de SALE y antes de checkpoint permite repetir sin duplicar efectos", async () => {
    const { f, run, newReconciler, checkpoints } = await fixture();
    f.client.paymentReconciliationCheckpoint.updateMany.mockRejectedValueOnce(new Error("simulated checkpoint outage"));
    await expect(run()).rejects.toThrow("simulated checkpoint outage");
    expectSale(f);
    expect(await checkpoints.get()).toMatchObject({ cursor: null, version: 0 });
    expect(await newReconciler().execute(runAt)).toMatchObject({ scanned: 0, cycleCompleted: true });
    expect(f.gateway.getPaymentState).toHaveBeenCalledTimes(1);
    expectSale(f);
  });

  it("error global no adelanta registro no evaluado; conserva avances previos", async () => {
    const { f, run, checkpoints, newReconciler } = await fixture();
    const original = structuredClone(f.attempt);
    missingResourceCandidates(f, 1);
    f.client.paymentAttempt.rows.push({ ...original, id: "later" });
    f.gateway.getPaymentState.mockRejectedValueOnce(new PaymentGatewayError("AUTHENTICATION", "test"));
    await expect(run()).rejects.toMatchObject({ code: "AUTHENTICATION" });
    expect(await checkpoints.get()).toMatchObject({ cursor: { id: "000" }, version: 1 });
    expect(await newReconciler().execute(runAt)).toMatchObject({ scanned: 1, reconciled: 1, cycleCompleted: true });
    expect(f.sales).toHaveLength(1);
  });

  it("ciclo vacío se cierra una sola vez por ejecución y siguiente obtiene nuevo cutoff", async () => {
    const { f, run, newReconciler, checkpoints } = await fixture();
    f.client.paymentAttempt.rows.splice(0);
    expect(await run()).toMatchObject({ scanned: 0, cycleCompleted: true, checkpointVersion: 1 });
    expect(await checkpoints.get()).toMatchObject({ cycleCutoff: null, cursor: null });
    const later = new Date(runAt.getTime() + 10 * 60_000);
    expect(await newReconciler().execute(later)).toMatchObject({
      scanned: 0, cycleCompleted: true, checkpointVersion: 3,
      cycleCutoff: new Date(later.getTime() - 5 * 60_000),
    });
    expect(f.client.paymentAttempt.findMany).toHaveBeenCalledTimes(2);
  });
});
