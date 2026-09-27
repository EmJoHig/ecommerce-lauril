import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ExternalCheckout } from "@/modules/payments/application/payment-gateway";
import { handleMercadoPagoWebhook } from "@/modules/payments/presentation/mercado-pago-webhook-handler";
import { authoritative, creationResponse, deferred, now, paymentRaceFixture, webhookInput } from "./helpers/payment-race-fixture";

// Reproduced on b4cbb13; preserve authoritative states across delayed snapshots.
describe("start payment / authoritative webhook race", () => {
  it("A: snapshot before APPROVED preserves one paid order and one SALE", async () => {
    const fixture = paymentRaceFixture();
    await fixture.start();
    expect(fixture.attempt.status).toBe("PENDING");
    expect(await fixture.webhook.execute(webhookInput("approved"))).toMatchObject({ kind: "approved" });
    expect(fixture.attempt.status).toBe("APPROVED");
    expectSale(fixture);
    expect(await fixture.webhook.execute(webhookInput("another-approved"))).toMatchObject({ kind: "duplicate" });
    expectSale(fixture);
  });

  it("single creation: early signed webhook becomes IGNORED and identical retry cannot recover after association", async () => {
    const fixture = paymentRaceFixture();
    const entered = deferred<void>();
    const response = deferred<ExternalCheckout>();
    fixture.gateway.createCheckout.mockImplementationOnce(() => { entered.resolve(); return response.promise; });
    const start = fixture.start();
    await entered.promise;
    expect(fixture.attempt).toMatchObject({ status: "CREATED", providerResourceId: null });
    const secret = "race-test-secret";
    const input = webhookInput("early-approved");
    const request = () => {
      const signature = createHmac("sha256", secret)
        .update(`id:${input.providerResourceId.toLowerCase()};request-id:${input.requestId};ts:1790510400;`).digest("hex");
      return new Request(`https://example.test/webhook?data.id=${input.providerResourceId}&type=order`, {
        method: "POST", headers: { "x-request-id": input.requestId, "x-signature": `ts=1790510400,v1=${signature}` },
        body: JSON.stringify({ id: input.providerEventId, type: "order", action: "updated", data: { id: input.providerResourceId } }),
      });
    };
    expect((await handleMercadoPagoWebhook(request(), { enabled: true, secret, processor: fixture.webhook })).status).toBe(200);
    expect(fixture.client.paymentEvent.rows[0]).toMatchObject({ processingStatus: "IGNORED", paymentAttemptId: null });
    expect(fixture.gateway.getPaymentState).not.toHaveBeenCalled();
    response.resolve(creationResponse());
    await start;
    expect(await fixture.webhook.execute(input)).toEqual({ kind: "duplicate" });
    expect(fixture.gateway.getPaymentState).not.toHaveBeenCalled();
    expect(fixture.attempt.status).toBe("PENDING");
    expect(fixture.order.status).toBe("PENDING_PAYMENT");
    expect(fixture.inventory).toMatchObject({ stockOnHand: 100, stockReserved: 5, version: 7 });
    expect(fixture.sales).toHaveLength(0);
    // A DIFFERENT event is not deduplicated and can recover the payment.
    expect(await fixture.webhook.execute(webhookInput("new-approved"))).toMatchObject({ kind: "approved" });
    expectSale(fixture);
  });

  it("B: a delayed concurrent creation snapshot must not overwrite APPROVED", async () => {
    const { fixture, finishDelayed } = await overlappingStarts();
    expect(await fixture.webhook.execute(webhookInput("approved"))).toMatchObject({ kind: "approved" });
    expect(fixture.attempt).toMatchObject({ status: "APPROVED", approvedAt: now });
    expectSale(fixture);
    await finishDelayed();
    expectSale(fixture);
    expect.soft(fixture.attempt.status).toBe("APPROVED");
    expect.soft(fixture.attempt.approvedAt).toEqual(now);
    // A subsequent approval remains idempotent because the state is consistent.
    expect(await fixture.webhook.execute(webhookInput("after-delayed-snapshot")))
      .toMatchObject({ kind: "duplicate" });
    expectSale(fixture);
  });

  it.each([
    { status: "REJECTED", providerStatus: "failed", providerStatusDetail: "rejected" },
    { status: "CANCELLED", providerStatus: "canceled", providerStatusDetail: "canceled" },
  ])("C/D: delayed snapshot must preserve $status", async ({ status, providerStatus, providerStatusDetail }) => {
    const { fixture, finishDelayed } = await overlappingStarts();
    fixture.gateway.getPaymentState.mockResolvedValue(authoritative({ providerStatus, providerStatusDetail, totalPaidAmountInCents: 0n }));
    await fixture.webhook.execute(webhookInput(status));
    expect(fixture.attempt.status).toBe(status);
    await finishDelayed();
    expect(fixture.order).toMatchObject({ status: "PENDING_PAYMENT", reservationReleasedAt: null });
    expect(fixture.inventory).toMatchObject({ stockOnHand: 100, stockReserved: 5, version: 7 });
    expect(fixture.sales).toHaveLength(0);
    expect(fixture.attempt.status).toBe(status);
  });

  it.each([
    { status: "PARTIALLY_REFUNDED", detail: "partially_refunded", amount: 1000n },
    { status: "REFUNDED", detail: "refunded", amount: 4600n },
  ])("E: delayed creation must preserve $status and authoritative refund amount", async ({ status, detail, amount }) => {
    const { fixture, finishDelayed } = await overlappingStarts();
    await fixture.webhook.execute(webhookInput("approved"));
    fixture.gateway.getPaymentState.mockResolvedValue(authoritative({ providerStatusDetail: detail, refundedAmountInCents: amount }));
    await fixture.webhook.execute(webhookInput("refund"));
    expect(fixture.attempt).toMatchObject({ status, refundedAmountInCents: amount });
    await finishDelayed();
    expectSale(fixture, status);
    expect.soft(fixture.attempt.status).toBe(status);
    expect.soft(fixture.attempt.refundedAmountInCents).toBe(amount);
  });

  it("F: two simultaneous starts share the winning attempt and key after real acquireActive handles P2002", async () => {
    const { fixture, firstResult, finishDelayed } = await overlappingStarts();
    const secondResult = await finishDelayed();
    expect(secondResult.attemptId).toBe(firstResult.attemptId);
    expect(fixture.client.paymentAttempt.create).toHaveBeenCalledTimes(2);
    expect(fixture.client.paymentAttempt.rows).toHaveLength(1);
    expect(fixture.gateway.createCheckout).toHaveBeenCalledTimes(2);
    const [first, second] = fixture.gateway.createCheckout.mock.calls;
    expect(first![0].idempotencyKey).toBe(second![0].idempotencyKey);
    expect(fixture.attempt.status).toBe("PENDING");
    expect(fixture.sales).toHaveLength(0);
  });
});

async function overlappingStarts() {
  const fixture = paymentRaceFixture();
  const firstEntered = deferred<void>();
  const secondEntered = deferred<void>();
  const firstResponse = deferred<ExternalCheckout>();
  const secondResponse = deferred<ExternalCheckout>();
  fixture.gateway.createCheckout
    .mockImplementationOnce(() => { firstEntered.resolve(); return firstResponse.promise; })
    .mockImplementationOnce(() => { secondEntered.resolve(); return secondResponse.promise; });
  // Both executions start before either can persist an attempt. The losing
  // create hits the modeled unique index; the REAL repository handles P2002.
  const firstStart = fixture.start();
  const secondStart = fixture.start();
  await Promise.all([firstEntered.promise, secondEntered.promise]);
  expect(fixture.client.paymentAttempt.rows).toHaveLength(1);
  expect(fixture.attempt).toMatchObject({ status: "CREATED", providerResourceId: null });
  firstResponse.resolve(creationResponse());
  const firstResult = await firstStart;
  expect(fixture.attempt).toMatchObject({ status: "PENDING", providerResourceId: "MP-RACE-1" });
  return {
    fixture, firstResult,
    finishDelayed: () => { secondResponse.resolve(creationResponse()); return secondStart; },
  };
}

function expectSale(fixture: ReturnType<typeof paymentRaceFixture>, status = "PAID") {
  expect(fixture.order).toMatchObject({ status, reservationReleasedAt: null });
  expect(fixture.inventory).toMatchObject({ stockOnHand: 98, stockReserved: 3, version: 8 });
  expect(fixture.sales).toEqual([expect.objectContaining({ type: "SALE", quantity: -2, stockBefore: 100, stockAfter: 98 })]);
}
