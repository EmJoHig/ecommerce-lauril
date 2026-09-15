import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { PrismaCustomerAdminRepository } from "@/modules/customers/infrastructure/prisma-customer-admin-repository";

const customerId = "70000000-0000-4000-8000-000000000001";
const userId = "70000000-0000-4000-8000-000000000002";
const actorUserId = "70000000-0000-4000-8000-000000000003";
const occurredAt = new Date("2026-09-15T12:00:00.000Z");

describe("PrismaCustomerAdminRepository customer status", () => {
  it("revoca solo las sesiones activas del usuario al cambiar de ACTIVE a DISABLED dentro de la transacción", async () => {
    const transaction = transactionFor("ACTIVE");
    const prisma = prismaFor(transaction);
    const repository = new PrismaCustomerAdminRepository(prisma);
    vi.spyOn(repository, "find").mockResolvedValue({ id: customerId } as never);

    await repository.setStatus({ customerId, actorUserId, status: "DISABLED", occurredAt });

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(transaction.customer.findUnique).toHaveBeenCalledWith({
      where: { id: customerId },
      select: { status: true, userId: true },
    });
    expect(transaction.customer.update).toHaveBeenCalledWith({
      where: { id: customerId },
      data: { status: "DISABLED", updatedAt: occurredAt },
    });
    expect(transaction.session.updateMany).toHaveBeenCalledWith({
      where: {
        userId,
        OR: [{ revokedAt: null }, { revokedAt: { isSet: false } }],
      },
      data: { revokedAt: occurredAt },
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith({ data: {
      actorUserId,
      action: "customer.status_change",
      entityType: "Customer",
      entityId: customerId,
      metadata: { fromStatus: "ACTIVE", toStatus: "DISABLED" },
      createdAt: occurredAt,
    } });
    expect(transaction.customer.update.mock.invocationCallOrder[0]).toBeLessThan(transaction.session.updateMany.mock.invocationCallOrder[0]!);
    expect(transaction.session.updateMany.mock.invocationCallOrder[0]).toBeLessThan(transaction.auditLog.create.mock.invocationCallOrder[0]!);
  });

  it("en DISABLED a DISABLED corrige sesiones legacy sin actualizar estado ni duplicar auditoría", async () => {
    const transaction = transactionFor("DISABLED");
    const repository = new PrismaCustomerAdminRepository(prismaFor(transaction));
    vi.spyOn(repository, "find").mockResolvedValue({ id: customerId } as never);

    await repository.setStatus({ customerId, actorUserId, status: "DISABLED", occurredAt });

    expect(transaction.session.updateMany).toHaveBeenCalledWith({
      where: {
        userId,
        OR: [{ revokedAt: null }, { revokedAt: { isSet: false } }],
      },
      data: { revokedAt: occurredAt },
    });
    expect(transaction.customer.update).not.toHaveBeenCalled();
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
  });

  it("al reactivar no modifica sesiones revocadas y conserva la auditoría del cambio", async () => {
    const transaction = transactionFor("DISABLED");
    const repository = new PrismaCustomerAdminRepository(prismaFor(transaction));
    vi.spyOn(repository, "find").mockResolvedValue({ id: customerId } as never);

    await repository.setStatus({ customerId, actorUserId, status: "ACTIVE", occurredAt });

    expect(transaction.customer.update).toHaveBeenCalledWith({
      where: { id: customerId },
      data: { status: "ACTIVE", updatedAt: occurredAt },
    });
    expect(transaction.session.updateMany).not.toHaveBeenCalled();
    expect(transaction.auditLog.create).toHaveBeenCalledOnce();
  });
});

function transactionFor(status: "ACTIVE" | "DISABLED") {
  return {
    customer: {
      findUnique: vi.fn().mockResolvedValue({ status, userId }),
      update: vi.fn().mockResolvedValue({}),
    },
    session: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
}

function prismaFor(transaction: ReturnType<typeof transactionFor>) {
  return {
    $transaction: vi.fn((callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)),
  } as unknown as PrismaClient;
}
