import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL es obligatoria.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function main(): Promise<void> {
  const [products, categories, variants, inventories, movements, admins] =
    await Promise.all([
      prisma.product.count(),
      prisma.category.count(),
      prisma.productVariant.count(),
      prisma.inventory.count(),
      prisma.inventoryMovement.count(),
      prisma.user.count({
        where: { roles: { some: { role: { code: "ADMIN" } } } },
      }),
    ]);

  const constraints = await prisma.$queryRaw<Array<{ conname: string }>>`
    SELECT conname
    FROM pg_constraint
    WHERE conname IN (
      'product_variants_prices_check',
      'inventory_non_negative_check',
      'inventory_reservation_within_stock_check',
      'inventory_movements_transition_check'
    )
  `;
  const defaultVariantIndex = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*)::bigint AS count
    FROM pg_indexes
    WHERE indexname = 'product_variants_one_default_per_product_key'
  `;

  const result = {
    products,
    categories,
    variants,
    inventories,
    movements,
    admins,
    verifiedConstraints: constraints.length,
    defaultVariantPartialIndex: defaultVariantIndex[0]?.count === 1n,
  };

  if (
    products !== 4 ||
    categories !== 3 ||
    variants !== 4 ||
    inventories !== 4 ||
    movements !== 4 ||
    admins !== 1 ||
    constraints.length !== 4 ||
    defaultVariantIndex[0]?.count !== 1n
  ) {
    throw new Error(`Verificación inesperada: ${JSON.stringify(result)}`);
  }

  console.info(JSON.stringify({ status: "ok", ...result }));
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
