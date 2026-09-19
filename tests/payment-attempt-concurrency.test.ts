import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { createPaymentAttempt } from "@/modules/payments/domain/payment";
import { PrismaPaymentAttemptRepository } from "@/modules/payments/infrastructure/prisma-payment-attempt-repository";

const orderId = "10000000-0000-4000-8000-000000000001";
const now = new Date("2026-09-18T12:00:00.000Z");

describe("PaymentAttempt concurrency", () => {
  it("ante P2002 devuelve el intento activo ganador en vez de crear otro", async () => {
    const winner = createPaymentAttempt({ orderId, provider: "MERCADO_PAGO", attemptNumber: 1, amountInCents: 4600n, currency: "ARS" }, now);
    const duplicate = Object.assign(new Error("duplicate"), { code: "P2002" });
    const paymentAttempt = {
      findFirst: vi.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(winner),
      create: vi.fn().mockRejectedValue(duplicate),
    };
    const repository = new PrismaPaymentAttemptRepository({ paymentAttempt } as unknown as PrismaClient);

    await expect(repository.acquireActive(acquireInput())).resolves.toEqual(winner);
    expect(paymentAttempt.create).toHaveBeenCalledOnce();
  });

  it("crea el número siguiente con otra key solo después de REJECTED o CANCELLED", async () => {
    const keys: string[] = [];
    for (const status of ["REJECTED", "CANCELLED"] as const) {
      const paymentAttempt = {
        findFirst: vi.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ attemptNumber: 1, status }),
        create: vi.fn().mockImplementation(({ data }) => {
          keys.push(data.idempotencyKey);
          return Promise.resolve(data);
        }),
      };
      const repository = new PrismaPaymentAttemptRepository({ paymentAttempt } as unknown as PrismaClient);
      await expect(repository.acquireActive(acquireInput())).resolves.toMatchObject({ attemptNumber: 2, status: "CREATED" });
    }
    expect(new Set(keys).size).toBe(2);
  });
});

function acquireInput() {
  return { orderId, provider: "MERCADO_PAGO" as const, amountInCents: 4600n, currency: "ARS", createdAt: now };
}
