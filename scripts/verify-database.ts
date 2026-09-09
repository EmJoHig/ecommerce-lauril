import "dotenv/config";

import { PrismaClient } from "../src/generated/prisma/client";
import { verifyPassword } from "../src/modules/auth/domain/password";

if (!process.env.MONGODB_URI) {
  throw new Error("MONGODB_URI es obligatoria.");
}

const prisma = new PrismaClient();

async function main(): Promise<void> {
  await prisma.$runCommandRaw({ ping: 1 });

  const expectedAdminEmail = process.env.VERIFY_ADMIN_EMAIL?.trim().toLowerCase();
  const expectedAdminPassword = process.env.VERIFY_ADMIN_PASSWORD;
  const [
    products,
    categories,
    variants,
    inventories,
    movements,
    customers,
    addresses,
    carts,
    orders,
    storeSettings,
    indexVersion,
    admins,
  ] = await Promise.all([
    prisma.product.findMany({
      select: {
        id: true,
        status: true,
        publishedAt: true,
        variants: { select: { isDefault: true, isActive: true } },
      },
    }),
    prisma.category.findMany({ select: { id: true, parentId: true } }),
    prisma.productVariant.findMany({ select: { id: true } }),
    prisma.inventory.findMany({
      select: {
        id: true,
        variantId: true,
        stockOnHand: true,
        stockReserved: true,
        minimumStock: true,
        _count: { select: { movements: true } },
      },
    }),
    prisma.inventoryMovement.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        inventoryId: true,
        quantity: true,
        stockBefore: true,
        stockAfter: true,
        createdAt: true,
      },
    }),
    prisma.customer.count(),
    prisma.customerAddress.findMany({
      select: { customerId: true, isDefault: true },
    }),
    prisma.cart.findMany({
      select: { guestTokenHash: true, customerId: true, status: true },
    }),
    prisma.order.findMany({
      select: {
        number: true,
        customerId: true,
        guestAccessTokenHash: true,
        currency: true,
        itemsSubtotalInCents: true,
        shippingAmountInCents: true,
        discountAmountInCents: true,
        totalInCents: true,
        createdAt: true,
        paymentExpiresAt: true,
      },
    }),
    prisma.storeSettings.findUnique({ where: { id: 1 } }),
    prisma.sequence.findUnique({ where: { id: "schema:indexes:v1" } }),
    prisma.user.findMany({
      where: { roles: { some: { role: { code: "ADMIN" } } } },
      select: { email: true, passwordHash: true },
    }),
  ]);

  const defaultAddressCounts = new Map<string, number>();
  for (const address of addresses) {
    if (address.isDefault) {
      defaultAddressCounts.set(
        address.customerId,
        (defaultAddressCounts.get(address.customerId) ?? 0) + 1,
      );
    }
  }

  const activeCartCounts = new Map<string, number>();
  for (const cart of carts) {
    if (cart.customerId && cart.status === "ACTIVE") {
      activeCartCounts.set(
        cart.customerId,
        (activeCartCounts.get(cart.customerId) ?? 0) + 1,
      );
    }
  }

  const variantIds = new Set(variants.map(({ id }) => id));
  const inventoryVariantIds = new Set(inventories.map(({ variantId }) => variantId));
  const latestMovementByInventory = new Map<string, number>();
  for (const movement of movements) {
    if (!latestMovementByInventory.has(movement.inventoryId)) {
      latestMovementByInventory.set(movement.inventoryId, movement.stockAfter);
    }
  }

  const failures = {
    missingInventory: variants.filter(({ id }) => !inventoryVariantIds.has(id)).length,
    orphanInventories: inventories.filter(({ variantId }) => !variantIds.has(variantId)).length,
    invalidInventory: inventories.filter(
      ({ stockOnHand, stockReserved, minimumStock }) =>
        stockOnHand < 0 ||
        stockReserved < 0 ||
        minimumStock < 0 ||
        stockReserved > stockOnHand,
    ).length,
    inventoryWithoutTrace: inventories.filter(({ id, stockOnHand, _count }) =>
      (_count.movements === 0 && stockOnHand !== 0) ||
      (_count.movements > 0 && latestMovementByInventory.get(id) !== stockOnHand),
    ).length,
    invalidMovements: movements.filter(
      ({ quantity, stockBefore, stockAfter }) =>
        quantity === 0 || stockAfter !== stockBefore + quantity || stockAfter < 0,
    ).length,
    invalidProductDefaults: products.filter(
      ({ status, variants: productVariants }) =>
        status !== "ARCHIVED" &&
        productVariants.filter(({ isDefault, isActive }) => isDefault && isActive).length !== 1,
    ).length,
    unpublishedActiveProducts: products.filter(
      ({ status, publishedAt }) => status === "ACTIVE" && !publishedAt,
    ).length,
    categoryCycles: countCategoryCycles(categories),
    duplicateDefaultAddresses: [...defaultAddressCounts.values()].filter((count) => count > 1).length,
    invalidCartOwners: carts.filter(
      ({ guestTokenHash, customerId }) => Boolean(guestTokenHash) === Boolean(customerId),
    ).length,
    duplicateActiveCustomerCarts: [...activeCartCounts.values()].filter((count) => count > 1).length,
    invalidOrders: orders.filter((order) =>
      Boolean(order.customerId) === Boolean(order.guestAccessTokenHash) ||
      order.number < 10001n ||
      order.currency !== "ARS" ||
      order.paymentExpiresAt <= order.createdAt ||
      order.itemsSubtotalInCents < 0n ||
      order.shippingAmountInCents < 0n ||
      order.discountAmountInCents < 0n ||
      order.totalInCents !==
        order.itemsSubtotalInCents +
          order.shippingAmountInCents -
          order.discountAmountInCents,
    ).length,
  };

  const expectedAdmin = expectedAdminEmail
    ? admins.find(({ email }) => email === expectedAdminEmail)
    : null;
  const expectedAdminPasswordMatches =
    expectedAdmin && expectedAdminPassword
      ? await verifyPassword(expectedAdminPassword, expectedAdmin.passwordHash)
      : null;

  if (
    products.length < 17 ||
    categories.length < 3 ||
    variants.length < 17 ||
    movements.length < 15 ||
    !storeSettings ||
    indexVersion?.value !== 1n ||
    !storeSettings.storeName.trim() ||
    !storeSettings.publicEmail.trim() ||
    Object.values(failures).some((count) => count !== 0) ||
    (expectedAdminEmail ? !expectedAdmin : false) ||
    expectedAdminPasswordMatches === false
  ) {
    throw new Error(
      `Verificación inesperada: ${JSON.stringify({
        products: products.length,
        categories: categories.length,
        variants: variants.length,
        inventories: inventories.length,
        movements: movements.length,
        customers,
        admins: admins.length,
        storeSettings: Boolean(storeSettings),
        ...failures,
        expectedAdminPasswordMatches,
      })}`,
    );
  }

  console.info(JSON.stringify({
    status: "ok",
    provider: "mongodb",
    products: products.length,
    categories: categories.length,
    variants: variants.length,
    inventories: inventories.length,
    movements: movements.length,
    customers,
    admins: admins.length,
    storeSettings: true,
    verifiedIndexes: 5,
    ...failures,
    expectedAdminPasswordMatches,
  }));
}

function countCategoryCycles(
  categories: ReadonlyArray<{ id: string; parentId: string | null }>,
): number {
  const parents = new Map(categories.map(({ id, parentId }) => [id, parentId]));
  let cycles = 0;
  for (const category of categories) {
    const visited = new Set<string>();
    let currentId: string | null = category.id;
    while (currentId) {
      if (visited.has(currentId)) {
        cycles += 1;
        break;
      }
      visited.add(currentId);
      currentId = parents.get(currentId) ?? null;
    }
  }
  return cycles;
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
