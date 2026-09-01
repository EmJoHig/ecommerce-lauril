import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { CartService } from "../src/modules/cart/application/cart-service";
import { hashGuestCartToken } from "../src/modules/cart/domain/guest-cart-token";
import { PrismaCartRepository } from "../src/modules/cart/infrastructure/prisma-cart-repository";
import { RecordInventoryMovement } from "../src/modules/inventory/application/record-inventory-movement";
import { PrismaInventoryUnitOfWork } from "../src/modules/inventory/infrastructure/prisma-inventory-unit-of-work";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL es obligatoria.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function main(): Promise<void> {
  const variants = await prisma.productVariant.findMany({
    where: {
      isActive: true,
      product: { status: "ACTIVE" },
      inventory: { stockOnHand: { gte: 4 } },
    },
    include: { inventory: true, product: true },
    orderBy: { sku: "asc" },
    take: 2,
  });
  const first = variants[0];
  const second = variants[1];
  if (!first?.inventory || !second?.inventory) {
    throw new Error("El seed necesita dos variantes con stock para la prueba FASE 3.");
  }

  const tokenA = hashGuestCartToken(`phase3-a-${crypto.randomUUID()}`);
  const tokenB = hashGuestCartToken(`phase3-b-${crypto.randomUUID()}`);
  const service = new CartService(new PrismaCartRepository(prisma), 30);
  const movementsBeforeCart = await prisma.inventoryMovement.count();

  await service.addItem({ tokenHash: tokenA, variantId: first.id, quantity: 1 });
  const addedTwice = await service.addItem({
    tokenHash: tokenA,
    variantId: first.id,
    quantity: 1,
  });
  if (addedTwice.items.length !== 1 || addedTwice.items[0]?.quantity !== 2) {
    throw new Error("Agregar dos veces creó líneas duplicadas.");
  }
  const updated = await service.updateItemQuantity({
    tokenHash: tokenA,
    variantId: first.id,
    quantity: 3,
  });
  if (updated.itemCount !== 3) throw new Error("La cantidad no se actualizó.");

  await service.addItem({ tokenHash: tokenA, variantId: second.id, quantity: 1 });
  await service.addItem({ tokenHash: tokenB, variantId: first.id, quantity: 1 });
  const persisted = await new CartService(
    new PrismaCartRepository(prisma),
    30,
  ).getCart(tokenA);
  const isolated = await service.getCart(tokenB);
  if (persisted.items.length !== 2 || isolated.itemCount !== 1) {
    throw new Error("Persistencia o aislamiento entre carritos incorrecto.");
  }

  const duplicateLines = await prisma.cartItem.groupBy({
    by: ["cartId", "variantId"],
    _count: true,
    having: { id: { _count: { gt: 1 } } },
  });
  if (duplicateLines.length > 0) throw new Error("Existen líneas duplicadas.");
  if ((await prisma.inventoryMovement.count()) !== movementsBeforeCart) {
    throw new Error("El carrito generó movimientos de inventario.");
  }

  const originalPrice = first.priceInCents;
  const originalPromotionalPrice = first.promotionalPriceInCents;
  await prisma.productVariant.update({
    where: { id: first.id },
    data: {
      priceInCents: originalPrice + 12345n,
      promotionalPriceInCents: null,
    },
  });
  const repriced = await service.getCart(tokenA);
  if (!repriced.items.find(({ variantId }) => variantId === first.id)?.priceChanged) {
    throw new Error("El carrito no detectó el cambio de precio.");
  }
  await prisma.productVariant.update({
    where: { id: first.id },
    data: {
      priceInCents: originalPrice,
      promotionalPriceInCents: originalPromotionalPrice,
    },
  });

  const stockReduction = first.inventory.stockOnHand - 1;
  await new RecordInventoryMovement(new PrismaInventoryUnitOfWork(prisma)).execute({
    inventoryId: first.inventory.id,
    type: "CORRECTION",
    quantity: -stockReduction,
    reason: "Prueba de recálculo de carrito FASE 3",
    referenceType: "phase3_verification",
    referenceId: tokenA.slice(0, 16),
    adminUserId: null,
  });
  const stockIssue = await service.getCart(tokenA);
  if (
    stockIssue.items.find(({ variantId }) => variantId === first.id)?.availability !==
    "INSUFFICIENT_STOCK"
  ) {
    throw new Error("El carrito no detectó la reducción de stock.");
  }
  await new RecordInventoryMovement(new PrismaInventoryUnitOfWork(prisma)).execute({
    inventoryId: first.inventory.id,
    type: "RECEIPT",
    quantity: stockReduction,
    reason: "Restauración posterior a prueba de carrito FASE 3",
    referenceType: "phase3_verification_restore",
    referenceId: tokenA.slice(0, 16),
    adminUserId: null,
  });

  await prisma.productVariant.update({ where: { id: first.id }, data: { isActive: false } });
  const inactiveVariant = await service.getCart(tokenA);
  if (
    inactiveVariant.items.find(({ variantId }) => variantId === first.id)?.availability !==
    "VARIANT_UNAVAILABLE"
  ) {
    throw new Error("El carrito no detectó la variante inactiva.");
  }
  await prisma.productVariant.update({ where: { id: first.id }, data: { isActive: true } });

  await service.removeItem(tokenA, second.id);
  const cleared = await service.clearCart(tokenA);
  if (cleared.itemCount !== 0 || cleared.items.length !== 0) {
    throw new Error("El carrito no se vació.");
  }

  console.info(JSON.stringify({
    status: "ok",
    anonymousCartCreated: true,
    sameVariantMerged: true,
    quantityUpdated: true,
    multipleProductsAdded: true,
    persistedAcrossServices: true,
    cartsIsolated: true,
    priceRecalculated: true,
    stockReductionDetected: true,
    inactiveVariantDetected: true,
    inventoryMovementsFromCart: 0,
    itemRemoved: true,
    cartCleared: true,
  }));
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
