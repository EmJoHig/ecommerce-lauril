import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { createPaymentAttempt, createPaymentEvent, paymentAttemptStatuses } from "@/modules/payments/domain/payment";
import { PrismaPaymentAttemptRepository } from "@/modules/payments/infrastructure/prisma-payment-attempt-repository";
import { PrismaPaymentEventRepository } from "@/modules/payments/infrastructure/prisma-payment-event-repository";
import { paymentRaceFixture } from "./helpers/payment-race-fixture";

const orderId = "10000000-0000-4000-8000-000000000001";
const now = new Date("2026-09-18T12:00:00.000Z");

describe("Prisma payment repositories", () => {
  it("persiste y mapea intentos sin convertir bigint a number", async () => {
    const attempt = createPaymentAttempt({
      orderId,
      provider: "MERCADO_PAGO",
      attemptNumber: 1,
      amountInCents: 4600n,
      currency: "ARS",
    }, now);
    const paymentAttempt = {
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve(data)),
      findMany: vi.fn().mockResolvedValue([attempt]),
    };
    const repository = new PrismaPaymentAttemptRepository({ paymentAttempt } as unknown as PrismaClient);

    await expect(repository.create(attempt)).resolves.toEqual(attempt);
    await expect(repository.listByOrderId(orderId)).resolves.toEqual([attempt]);
    expect(paymentAttempt.create).toHaveBeenCalledWith({ data: attempt });
    expect(paymentAttempt.findMany).toHaveBeenCalledWith({
      where: { orderId },
      orderBy: [{ attemptNumber: "asc" }, { createdAt: "asc" }],
    });
  });

  it("busca el recurso externo por provider y actualiza el snapshot completo", async () => {
    const attempt = createPaymentAttempt({ orderId, provider: "MERCADO_PAGO", attemptNumber: 1, amountInCents: 100n, currency: "ARS" }, now);
    const persisted = {
      ...attempt,
      status: "PENDING" as const,
      providerResourceId: "mp-order-1",
      checkoutUrl: "https://checkout.example.test/1",
      providerStatus: "created",
      updatedAt: new Date("2026-09-18T12:01:00.000Z"),
    };
    const paymentAttempt = {
      findFirst: vi.fn().mockResolvedValue(persisted),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn().mockResolvedValue(persisted),
    };
    const repository = new PrismaPaymentAttemptRepository({ paymentAttempt } as unknown as PrismaClient);

    await expect(repository.findByProviderResourceId("MERCADO_PAGO", "mp-order-1")).resolves.toEqual(persisted);
    await repository.updateSnapshot({
      id: attempt.id,
      status: "PENDING",
      providerResourceId: "mp-order-1",
      checkoutUrl: "https://checkout.example.test/1",
      providerStatus: "created",
      providerStatusDetail: null,
      approvedAt: null,
      rejectedAt: null,
      refundedAmountInCents: 0n,
    });
    expect(paymentAttempt.findFirst).toHaveBeenCalledWith({
      where: { provider: "MERCADO_PAGO", providerResourceId: "mp-order-1" },
    });
    expect(paymentAttempt.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: attempt.id, status: { in: ["CREATED", "PENDING"] } },
      data: expect.objectContaining({ providerResourceId: "mp-order-1", status: "PENDING" }),
    }));
  });

  it("sólo CREATED/PENDING admiten snapshot inicial; preserva íntegros los seis estados avanzados", async () => {
    for (const status of paymentAttemptStatuses) {
      const fixture = paymentRaceFixture();
      const current = {
        ...createPaymentAttempt({ orderId, provider: "MERCADO_PAGO", attemptNumber: 1, amountInCents: 4600n, currency: "ARS" }, now),
        status,
        providerResourceId: "existing-resource",
        checkoutUrl: "https://checkout.example.test/existing",
        providerStatus: "authoritative-status",
        providerStatusDetail: "authoritative-detail",
        approvedAt: now,
        rejectedAt: now,
        refundedAmountInCents: 1200n,
      };
      await fixture.attempts.create(current);
      const snapshot = {
        id: current.id, status: "PENDING" as const,
        providerResourceId: "creation-resource", checkoutUrl: "https://checkout.example.test/creation",
        providerStatus: "created", providerStatusDetail: "created",
        approvedAt: null, rejectedAt: null, refundedAmountInCents: 0n,
      };
      const compatible = status === "CREATED" || status === "PENDING";
      const expected = compatible ? { ...current, ...snapshot } : current;
      const result = await fixture.attempts.updateSnapshot(snapshot);
      expect(result, status).toEqual(expected);
      expect(await fixture.attempts.findById(current.id), status).toEqual(expected);
      expect(fixture.client.paymentAttempt.updateMany).toHaveBeenCalledExactlyOnceWith({
        where: { id: current.id, status: { in: ["CREATED", "PENDING"] } },
        data: Object.fromEntries(Object.entries(snapshot).filter(([key]) => key !== "id")),
      });
      expect(fixture.client.paymentAttempt.update).not.toHaveBeenCalled();
    }
  });

  it("persiste un evento una vez y devuelve el existente ante P2002", async () => {
    const event = createPaymentEvent({
      provider: "MERCADO_PAGO",
      providerEventId: "event-1",
      providerResourceId: "mp-order-1",
      eventType: "order",
      receivedAt: now,
    });
    const duplicate = Object.assign(new Error("duplicate"), { code: "P2002" });
    const paymentEvent = {
      create: vi.fn()
        .mockResolvedValueOnce(event)
        .mockRejectedValueOnce(duplicate),
      findUnique: vi.fn().mockResolvedValue(event),
    };
    const repository = new PrismaPaymentEventRepository({ paymentEvent } as unknown as PrismaClient);

    await expect(repository.persistIfAbsent(event)).resolves.toEqual({ event, created: true });
    await expect(repository.persistIfAbsent(event)).resolves.toEqual({ event, created: false });
    expect(paymentEvent.findUnique).toHaveBeenCalledWith({
      where: { provider_providerEventId: { provider: "MERCADO_PAGO", providerEventId: "event-1" } },
    });
  });
});
