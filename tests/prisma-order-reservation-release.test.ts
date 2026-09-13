import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import type { CreateOrderRecordInput } from "@/modules/orders/application/order-repository";
import { PrismaOrderAdminRepository } from "@/modules/orders/infrastructure/prisma-order-admin-repository";
import { PrismaOrderRepository } from "@/modules/orders/infrastructure/prisma-order-repository";

const notReleasedFilter = {
  OR: [
    { reservationReleasedAt: null },
    { reservationReleasedAt: { isSet: false } },
  ],
};

describe("reservas de pedidos con campos opcionales MongoDB", () => {
  it("crea pedidos nuevos con reservationReleasedAt null explícito", async () => {
    const order = {
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({
        ...data,
        id: "order-id",
        createdAt: new Date("2026-09-13T12:00:00.000Z"),
        items: [],
        statusHistory: [],
      })),
    };
    const transaction = {
      sequence: { upsert: vi.fn().mockResolvedValue({ value: 10001n }) },
      order,
    };
    const prisma = {
      $transaction: vi.fn((callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)),
    } as unknown as PrismaClient;
    const repository = new PrismaOrderRepository(prisma);

    await repository.run((tx) => tx.createOrder(createOrderInput()));

    expect(order.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ reservationReleasedAt: null }),
    }));
  });

  it("incluye pedidos vencidos con reserva null o ausente", async () => {
    const now = new Date("2026-09-13T12:00:00.000Z");
    const order = { findMany: vi.fn().mockResolvedValue([{ id: "order-id" }]) };
    const repository = new PrismaOrderRepository({ order } as unknown as PrismaClient);

    await expect(repository.listExpiredPendingOrderIds(now, 25)).resolves.toEqual(["order-id"]);

    expect(order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        status: "PENDING_PAYMENT",
        paymentExpiresAt: { lte: now },
        ...notReleasedFilter,
      },
    }));
  });

  it("cancela administrativamente un pedido heredado con el campo ausente", async () => {
    const changedAt = new Date("2026-09-13T12:00:00.000Z");
    const persistedOrder = {
      id: "order-id",
      status: "PENDING_PAYMENT",
      reservationReleasedAt: null,
      items: [{
        quantity: 2,
        productVariant: {
          inventory: { id: "inventory-id", stockOnHand: 10, stockReserved: 3, version: 7 },
        },
      }],
    };
    const order = {
      findUnique: vi.fn()
        .mockResolvedValueOnce(persistedOrder)
        .mockResolvedValueOnce(null),
      updateMany: vi.fn().mockImplementation(({ where }) => Promise.resolve({
        count: where.OR?.some((condition: { reservationReleasedAt?: { isSet?: boolean } }) =>
          condition.reservationReleasedAt?.isSet === false) ? 1 : 0,
      })),
    };
    const inventory = { updateMany: vi.fn().mockResolvedValue({ count: 1 }) };
    const transaction = {
      order,
      inventory,
      orderStatusHistory: { create: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      order,
      $transaction: vi.fn((callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)),
    } as unknown as PrismaClient;
    const repository = new PrismaOrderAdminRepository(prisma);

    await expect(repository.cancelPending({
      orderId: "order-id",
      actorUserId: "admin-id",
      reason: "Cancelado por administración.",
      changedAt,
    })).resolves.toMatchObject({ changed: true });

    expect(inventory.updateMany).toHaveBeenCalledWith({
      where: { id: "inventory-id", version: 7 },
      data: { stockReserved: 1, version: { increment: 1 } },
    });
    expect(order.updateMany).toHaveBeenCalledWith({
      where: { id: "order-id", status: "PENDING_PAYMENT", ...notReleasedFilter },
      data: { status: "CANCELLED", reservationReleasedAt: changedAt, updatedAt: changedAt },
    });
  });

  it("cancela por vencimiento un pedido heredado con el campo ausente", async () => {
    const expiredAt = new Date("2026-09-13T12:00:00.000Z");
    const order = {
      updateMany: vi.fn().mockImplementation(({ where }) => Promise.resolve({
        count: where.OR?.some((condition: { reservationReleasedAt?: { isSet?: boolean } }) =>
          condition.reservationReleasedAt?.isSet === false) ? 1 : 0,
      })),
    };
    const transaction = {
      order,
      orderStatusHistory: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: vi.fn((callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)),
    } as unknown as PrismaClient;
    const repository = new PrismaOrderRepository(prisma);

    await expect(repository.run((tx) => tx.cancelExpiredOrder("order-id", expiredAt))).resolves.toBe(true);

    expect(order.updateMany).toHaveBeenCalledWith({
      where: {
        id: "order-id",
        status: "PENDING_PAYMENT",
        paymentExpiresAt: { lte: expiredAt },
        ...notReleasedFilter,
      },
      data: { status: "CANCELLED", reservationReleasedAt: expiredAt },
    });
  });
});

function createOrderInput(): CreateOrderRecordInput {
  return {
    cartId: "cart-id",
    customerId: null,
    shippingMethodId: "shipping-id",
    checkoutKeyHash: "a".repeat(64),
    guestAccessTokenHash: "b".repeat(64),
    buyer: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", phone: "123456" },
    shipping: {
      methodName: "Retiro",
      methodType: "PICKUP",
      requiresAddress: false,
      recipientFirstName: null,
      recipientLastName: null,
      phone: null,
      street: null,
      streetNumber: null,
      floorApartment: null,
      city: null,
      province: null,
      postalCode: null,
      references: null,
    },
    totals: {
      itemsSubtotalInCents: 1000n,
      shippingAmountInCents: 0n,
      discountAmountInCents: 0n,
      totalInCents: 1000n,
    },
    paymentExpiresAt: new Date("2026-09-13T12:15:00.000Z"),
    items: [{
      productId: "product-id",
      productVariantId: "variant-id",
      productName: "Producto",
      variantName: "Variante",
      sku: "SKU-1",
      unitPriceInCents: 1000n,
      quantity: 1,
      subtotalInCents: 1000n,
    }],
  };
}
