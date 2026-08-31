import "server-only";

import { getPrisma } from "@/shared/infrastructure/prisma";

export async function getAdminCatalogOverview() {
  const prisma = getPrisma();
  const [productCount, activeProductCount, categoryCount, lowStockCount] =
    await Promise.all([
      prisma.product.count({ where: { status: { not: "ARCHIVED" } } }),
      prisma.product.count({ where: { status: "ACTIVE" } }),
      prisma.category.count({ where: { isActive: true } }),
      prisma.inventory.count({
        where: { stockOnHand: { lte: prisma.inventory.fields.minimumStock } },
      }),
    ]);

  return { productCount, activeProductCount, categoryCount, lowStockCount };
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

  return products.map((product) => ({
    id: product.id,
    name: product.name,
    slug: product.slug,
    status: product.status,
    featured: product.featured,
    categoryNames: product.categories.map(({ category }) => category.name),
    variants: product.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      name: variant.name,
      priceInCents: variant.priceInCents,
      stockOnHand: variant.inventory?.stockOnHand ?? 0,
      stockReserved: variant.inventory?.stockReserved ?? 0,
      minimumStock: variant.inventory?.minimumStock ?? 0,
    })),
  }));
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
    available: inventory.stockOnHand - inventory.stockReserved,
    minimumStock: inventory.minimumStock,
    lastMovement: inventory.movements[0]?.type ?? null,
    updatedAt: inventory.updatedAt,
  }));
}
