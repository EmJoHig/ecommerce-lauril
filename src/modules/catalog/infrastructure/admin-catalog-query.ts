import "server-only";

import { getPrisma } from "@/shared/infrastructure/prisma";
import {
  calculateAvailableStock,
  isLowStock,
} from "@/modules/inventory/domain/inventory";

export async function getAdminCatalogOverview() {
  const prisma = getPrisma();
  const [productCount, activeProductCount, categoryCount, lowStockRows] =
    await Promise.all([
      prisma.product.count({ where: { status: { not: "ARCHIVED" } } }),
      prisma.product.count({ where: { status: "ACTIVE" } }),
      prisma.category.count({ where: { isActive: true } }),
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS count
        FROM inventory
        WHERE stock_on_hand - stock_reserved <= minimum_stock
      `,
    ]);

  return {
    productCount,
    activeProductCount,
    categoryCount,
    lowStockCount: Number(lowStockRows[0]?.count ?? 0n),
  };
}

export async function listAdminProducts() {
  const products = await getPrisma().product.findMany({
    where: { status: { not: "ARCHIVED" } },
    orderBy: { updatedAt: "desc" },
    include: {
      categories: { include: { category: true }, orderBy: { sortOrder: "asc" } },
      variants: {
        orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }],
        include: { inventory: true },
      },
    },
  });

  return products.map((product) => {
    const variants = product.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      name: variant.name,
      priceInCents: variant.priceInCents,
      availableStock: calculateAvailableStock(
        variant.inventory?.stockOnHand ?? 0,
        variant.inventory?.stockReserved ?? 0,
      ),
      minimumStock: variant.inventory?.minimumStock ?? 0,
    }));

    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      status: product.status,
      featured: product.featured,
      categoryNames: product.categories.map(({ category }) => category.name),
      availableStock: variants.reduce(
        (total, variant) => total + variant.availableStock,
        0,
      ),
      variants,
    };
  });
}

export async function listInventoryRows() {
  const rows = await getPrisma().inventory.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      variant: { include: { product: { select: { name: true } } } },
      movements: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  return rows.map((inventory) => ({
    id: inventory.id,
    productName: inventory.variant.product.name,
    variantName: inventory.variant.name,
    sku: inventory.variant.sku,
    stockOnHand: inventory.stockOnHand,
    stockReserved: inventory.stockReserved,
    available: calculateAvailableStock(
      inventory.stockOnHand,
      inventory.stockReserved,
    ),
    minimumStock: inventory.minimumStock,
    isLowStock: isLowStock(
      inventory.stockOnHand,
      inventory.stockReserved,
      inventory.minimumStock,
    ),
    lastMovement: inventory.movements[0]?.type ?? null,
    updatedAt: inventory.updatedAt,
  }));
}
