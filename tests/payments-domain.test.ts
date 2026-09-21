import { describe, expect, it } from "vitest";
import {
  createPaymentAttempt,
  createPaymentEvent,
  paymentAttemptStatuses,
  paymentEventProcessingStatuses,
} from "@/modules/payments/domain/payment";
import { ValidationError } from "@/shared/domain/errors";

const orderId = "10000000-0000-4000-8000-000000000001";
const attemptId = "10000000-0000-4000-8000-000000000002";
const now = new Date("2026-09-18T12:00:00.000Z");

describe("payments domain", () => {
  it("crea un intento con estados provider-neutral y snapshots iniciales seguros", () => {
    const attempt = createPaymentAttempt({
      orderId,
      provider: "MERCADO_PAGO",
      attemptNumber: 1,
      amountInCents: 123456n,
      currency: "ars",
    }, now);

    expect(attempt).toMatchObject({
      orderId,
      provider: "MERCADO_PAGO",
      attemptNumber: 1,
      status: "CREATED",
      amountInCents: 123456n,
      currency: "ARS",
      providerResourceId: null,
      refundedAmountInCents: 0n,
      createdAt: now,
      updatedAt: now,
    });
    expect(attempt.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(paymentAttemptStatuses).toEqual([
      "CREATED", "PENDING", "APPROVED", "REJECTED", "CANCELLED", "REFUNDED",
      "PARTIALLY_REFUNDED", "REQUIRES_REVIEW",
    ]);
    expect(paymentEventProcessingStatuses).toEqual(["RECEIVED", "PROCESSED", "IGNORED", "FAILED"]);
  });

  it("rechaza números de intento no positivos o no enteros", () => {
    for (const attemptNumber of [0, -1, 1.5]) {
      expect(() => createPaymentAttempt({
        orderId,
        provider: "MERCADO_PAGO",
        attemptNumber,
        amountInCents: 100n,
        currency: "ARS",
      }, now)).toThrow(ValidationError);
    }
  });

  it("valida monto bigint no negativo y snapshot de moneda ISO", () => {
    expect(createPaymentAttempt({
      orderId,
      provider: "MERCADO_PAGO",
      attemptNumber: 1,
      amountInCents: 0n,
      currency: "usd",
    }, now)).toMatchObject({ amountInCents: 0n, currency: "USD" });
    expect(() => createPaymentAttempt({
      orderId,
      provider: "MERCADO_PAGO",
      attemptNumber: 1,
      amountInCents: -1n,
      currency: "ARS",
    }, now)).toThrow(ValidationError);
    expect(() => createPaymentAttempt({
      orderId,
      provider: "MERCADO_PAGO",
      attemptNumber: 1,
      amountInCents: 100n,
      currency: "peso",
    }, now)).toThrow(ValidationError);
  });

  it("genera una idempotencyKey UUID por intento y la conserva en el intento creado", () => {
    const first = createPaymentAttempt({ orderId, provider: "MERCADO_PAGO", attemptNumber: 1, amountInCents: 100n, currency: "ARS" }, now);
    const second = createPaymentAttempt({ orderId, provider: "MERCADO_PAGO", attemptNumber: 2, amountInCents: 100n, currency: "ARS" }, now);

    expect(first.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(first.idempotencyKey).toBe(first.idempotencyKey);
    expect([first.attemptNumber, second.attemptNumber]).toEqual([1, 2]);
  });

  it("crea un evento deduplicable con metadata mínima y sin campos sensibles", () => {
    const event = createPaymentEvent({
      provider: "MERCADO_PAGO",
      providerEventId: "event-123",
      providerResourceId: "order-456",
      eventType: "order",
      action: "updated",
      requestId: "request-789",
      paymentAttemptId: attemptId,
      receivedAt: now,
    });

    expect(event).toMatchObject({
      provider: "MERCADO_PAGO",
      providerEventId: "event-123",
      providerResourceId: "order-456",
      processingStatus: "RECEIVED",
      processedAt: null,
    });
    expect(Object.keys(event)).not.toEqual(expect.arrayContaining([
      "accessToken", "webhookSecret", "xSignature", "cookies", "password", "cardData", "headers", "rawBody",
    ]));
  });
});
