import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { verifyPassword } from "../src/modules/auth/domain/password";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL es obligatoria.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function main(): Promise<void> {
  const expectedAdminEmail = process.env.VERIFY_ADMIN_EMAIL
    ?.trim()
    .toLowerCase();
  const expectedAdminPassword = process.env.VERIFY_ADMIN_PASSWORD;
  if (Boolean(expectedAdminEmail) !== Boolean(expectedAdminPassword)) {
    throw new Error(
      "VERIFY_ADMIN_EMAIL y VERIFY_ADMIN_PASSWORD deben definirse juntos.",
    );
  }

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
      'product_variants_sku_normalized_check',
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
  const lowStockIndex = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*)::bigint AS count
    FROM pg_indexes
    WHERE indexname = 'inventory_low_stock_idx'
  `;
  const lowStockRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*)::bigint AS count
    FROM inventory
    WHERE stock_on_hand - stock_reserved <= minimum_stock
  `;
  const timestampColumns = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*)::bigint AS count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'inventory'
      AND column_name IN ('created_at', 'updated_at')
      AND data_type = 'timestamp with time zone'
      AND is_nullable = 'NO'
  `;
  const productSlugColumn = await prisma.$queryRaw<
    Array<{ character_maximum_length: number | null }>
  >`
    SELECT character_maximum_length
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'products'
      AND column_name = 'slug'
  `;
  const expectedAdmin = expectedAdminEmail
    ? await prisma.user.findUnique({
        where: { email: expectedAdminEmail },
        select: { passwordHash: true },
      })
    : null;
  const expectedAdminPasswordMatches = expectedAdminPassword
    ? Boolean(
        expectedAdmin &&
          (await verifyPassword(
            expectedAdminPassword,
            expectedAdmin.passwordHash,
          )),
      )
    : null;

  const result = {
    products,
    categories,
    variants,
    inventories,
    movements,
    admins,
    verifiedConstraints: constraints.length,
    defaultVariantPartialIndex: defaultVariantIndex[0]?.count === 1n,
    lowStockIndex: lowStockIndex[0]?.count === 1n,
    lowStockRows: Number(lowStockRows[0]?.count ?? 0n),
    inventoryTimestampColumns: Number(timestampColumns[0]?.count ?? 0n),
    productSlugMaxLength:
      productSlugColumn[0]?.character_maximum_length ?? null,
    expectedAdminPasswordMatches,
  };

  if (
    products !== 4 ||
    categories !== 3 ||
    variants !== 4 ||
    inventories !== 4 ||
    movements !== 4 ||
    admins !== 1 ||
    constraints.length !== 5 ||
    defaultVariantIndex[0]?.count !== 1n ||
    lowStockIndex[0]?.count !== 1n ||
    lowStockRows[0]?.count !== 1n ||
    timestampColumns[0]?.count !== 2n ||
    productSlugColumn[0]?.character_maximum_length !== 180 ||
    expectedAdminPasswordMatches === false
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
