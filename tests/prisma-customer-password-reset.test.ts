import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { PrismaCustomerRepository } from "@/modules/customers/infrastructure/prisma-customer-repository";

describe("PrismaCustomerRepository password reset en MongoDB", () => {
  it("invalida tokens anteriores con usedAt ausente y crea el nuevo con null explícito", async () => {
    const passwordResetToken = {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue({}),
    };
    const auditLog = { create: vi.fn().mockResolvedValue({}) };
    const prisma = {
      passwordResetToken,
      auditLog,
      $transaction: vi.fn().mockResolvedValue([]),
    } as unknown as PrismaClient;
    const repository = new PrismaCustomerRepository(prisma);
    const occurredAt = new Date("2026-09-01T12:00:00.000Z");
    const expiresAt = new Date("2026-09-01T12:30:00.000Z");

    await repository.createPasswordReset({
      userId: "user-id",
      tokenHash: "a".repeat(64),
      occurredAt,
      expiresAt,
      ipAddress: null,
    });

    expect(passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-id",
        OR: [{ usedAt: null }, { usedAt: { isSet: false } }],
      },
      data: { usedAt: occurredAt },
    });
    expect(passwordResetToken.create).toHaveBeenCalledWith({
      data: {
        userId: "user-id",
        tokenHash: "a".repeat(64),
        expiresAt,
        usedAt: null,
      },
    });
  });

  it("consume tokens y revoca sesiones aunque los campos opcionales heredados estén ausentes", async () => {
    const occurredAt = new Date("2026-09-01T12:00:00.000Z");
    const token = {
      id: "reset-id",
      userId: "user-id",
      usedAt: null,
      expiresAt: new Date("2026-09-01T12:30:00.000Z"),
    };
    const transaction = {
      passwordResetToken: {
        findUnique: vi.fn().mockResolvedValue(token),
        updateMany: vi.fn().mockImplementation(({ where }) => Promise.resolve({
          count: where.OR?.some((condition: { usedAt?: { isSet?: boolean } }) => condition.usedAt?.isSet === false) ? 1 : 0,
        })),
      },
      user: { update: vi.fn().mockResolvedValue({}) },
      session: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: vi.fn((callback: (tx: typeof transaction) => Promise<boolean>) => callback(transaction)),
    } as unknown as PrismaClient;
    const repository = new PrismaCustomerRepository(prisma);

    await expect(repository.consumePasswordReset({
      tokenHash: "a".repeat(64),
      passwordHash: "$2b$10$hash",
      occurredAt,
      ipAddress: null,
    })).resolves.toBe(true);

    expect(transaction.passwordResetToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: [{ usedAt: null }, { usedAt: { isSet: false } }] }),
    }));
    expect(transaction.user.update).toHaveBeenCalledWith({
      where: { id: token.userId },
      data: { passwordHash: "$2b$10$hash" },
    });
    expect(transaction.session.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: [{ revokedAt: null }, { revokedAt: { isSet: false } }] }),
    }));
  });
});
