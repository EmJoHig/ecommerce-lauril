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

  const [products, categories, variants, inventories, movements, admins, customers, addresses] =
    await Promise.all([
      prisma.product.count(),
      prisma.category.count(),
      prisma.productVariant.count(),
      prisma.inventory.count(),
      prisma.inventoryMovement.count(),
      prisma.user.count({
        where: { roles: { some: { role: { code: "ADMIN" } } } },
      }),
      prisma.customer.count(),
      prisma.customerAddress.count(),
    ]);

  const constraints = await prisma.$queryRaw<Array<{ conname: string }>>`
    SELECT conname
    FROM pg_constraint
    WHERE conname IN (
      'products_slug_normalized_check',
      'products_active_has_publication_check',
      'product_variants_prices_check',
      'product_variants_sku_normalized_check',
      'categories_not_own_parent_check',
      'categories_slug_normalized_check',
      'inventory_non_negative_check',
      'inventory_reservation_within_stock_check',
      'inventory_movements_quantity_check',
      'inventory_movements_transition_check',
      'inventory_movements_direction_check',
      'carts_guest_token_hash_check',
      'carts_version_non_negative_check',
      'carts_expiration_after_creation_check',
      'cart_items_quantity_check',
      'cart_items_price_snapshot_check'
      ,'customers_phone_not_blank_check'
      ,'customers_document_not_blank_check'
      ,'customer_addresses_required_text_check'
      ,'carts_exactly_one_owner_check'
      ,'shipping_methods_code_format_check'
      ,'shipping_methods_name_not_blank_check'
      ,'shipping_methods_amounts_check'
      ,'shipping_methods_address_policy_check'
      ,'orders_owner_access_check'
      ,'orders_buyer_snapshot_check'
      ,'orders_address_snapshot_check'
      ,'orders_totals_check'
      ,'orders_number_currency_check'
      ,'orders_expiration_check'
      ,'order_items_snapshot_check'
      ,'order_status_history_transition_check'
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
  const adminCatalogIndex = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*)::bigint AS count
    FROM pg_indexes
    WHERE indexname = 'products_status_updated_at_idx'
  `;
  const cartIndexes = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*)::bigint AS count
    FROM pg_indexes
    WHERE indexname IN (
      'carts_guest_token_hash_key',
      'carts_status_expires_at_idx',
      'cart_items_cart_id_variant_id_key',
      'carts_one_active_per_customer_key'
    )
  `;
  const customerIndexes = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*)::bigint AS count
    FROM pg_indexes
    WHERE indexname IN (
      'customers_user_id_key',
      'customer_addresses_one_default_key',
      'carts_customer_id_status_updated_at_idx'
    )
  `;
  const checkoutIndexes = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*)::bigint AS count FROM pg_indexes WHERE indexname IN (
      'shipping_methods_code_key', 'orders_order_number_key', 'orders_cart_id_key',
      'orders_checkout_key_hash_key', 'orders_guest_access_token_hash_key',
      'orders_status_payment_expires_at_idx'
    )
  `;
  const invalidCustomerCarts = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*)::bigint AS count
    FROM (
      SELECT customer_id
      FROM carts
      WHERE customer_id IS NOT NULL AND status = 'ACTIVE'
      GROUP BY customer_id
      HAVING count(*) > 1
    ) invalid
  `;
  const invalidDefaultAddresses = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*)::bigint AS count
    FROM (
      SELECT customer_id
      FROM customer_addresses
      WHERE is_default = true
      GROUP BY customer_id
      HAVING count(*) > 1
    ) invalid
  `;
  const variantsWithoutInventory = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*)::bigint AS count
    FROM product_variants variant
    LEFT JOIN inventory ON inventory.variant_id = variant.id
    WHERE inventory.id IS NULL
  `;
  const productsWithoutValidDefault = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*)::bigint AS count
    FROM (
      SELECT product.id
      FROM products product
      LEFT JOIN product_variants variant ON variant.product_id = product.id
      WHERE product.status <> 'ARCHIVED'
      GROUP BY product.id
      HAVING count(*) FILTER (
        WHERE variant.is_default = true AND variant.is_active = true
      ) <> 1
    ) invalid_products
  `;
  const inventoryWithoutTrace = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*)::bigint AS count
    FROM inventory
    LEFT JOIN LATERAL (
      SELECT movement.stock_after
      FROM inventory_movements movement
      WHERE movement.inventory_id = inventory.id
      ORDER BY movement.created_at DESC, movement.id DESC
      LIMIT 1
    ) latest_movement ON true
    WHERE
      (latest_movement.stock_after IS NULL AND inventory.stock_on_hand <> 0)
      OR
      (latest_movement.stock_after IS NOT NULL
        AND latest_movement.stock_after <> inventory.stock_on_hand)
  `;
  const categoryCycles = await prisma.$queryRaw<Array<{ count: bigint }>>`
    WITH RECURSIVE ancestry AS (
      SELECT
        category.id AS start_id,
        category.id,
        category.parent_id,
        ARRAY[category.id]::uuid[] AS path,
        false AS cycle
      FROM categories category

      UNION ALL

      SELECT
        ancestry.start_id,
        parent.id,
        parent.parent_id,
        ancestry.path || parent.id,
        parent.id = ANY(ancestry.path) AS cycle
      FROM ancestry
      JOIN categories parent ON parent.id = ancestry.parent_id
      WHERE ancestry.cycle = false
    )
    SELECT count(*)::bigint AS count
    FROM ancestry
    WHERE cycle = true
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
  const cartTimestampColumns = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*)::bigint AS count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'carts'
      AND column_name IN ('expires_at', 'created_at', 'updated_at')
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
    customers,
    addresses,
    verifiedConstraints: constraints.length,
    defaultVariantPartialIndex: defaultVariantIndex[0]?.count === 1n,
    lowStockIndex: lowStockIndex[0]?.count === 1n,
    adminCatalogIndex: adminCatalogIndex[0]?.count === 1n,
    cartIndexes: Number(cartIndexes[0]?.count ?? 0n),
    customerIndexes: Number(customerIndexes[0]?.count ?? 0n),
    checkoutIndexes: Number(checkoutIndexes[0]?.count ?? 0n),
    invalidCustomerCarts: Number(invalidCustomerCarts[0]?.count ?? 0n),
    invalidDefaultAddresses: Number(invalidDefaultAddresses[0]?.count ?? 0n),
    variantsWithoutInventory: Number(variantsWithoutInventory[0]?.count ?? 0n),
    productsWithoutValidDefault: Number(
      productsWithoutValidDefault[0]?.count ?? 0n,
    ),
    inventoryWithoutTrace: Number(inventoryWithoutTrace[0]?.count ?? 0n),
    categoryCycles: Number(categoryCycles[0]?.count ?? 0n),
    inventoryTimestampColumns: Number(timestampColumns[0]?.count ?? 0n),
    cartTimestampColumns: Number(cartTimestampColumns[0]?.count ?? 0n),
    productSlugMaxLength:
      productSlugColumn[0]?.character_maximum_length ?? null,
    expectedAdminPasswordMatches,
  };

  if (
    products < 4 ||
    categories < 3 ||
    variants < 4 ||
    inventories !== variants ||
    movements < 4 ||
    (expectedAdminEmail ? admins < 1 : false) ||
    constraints.length !== 32 ||
    defaultVariantIndex[0]?.count !== 1n ||
    lowStockIndex[0]?.count !== 1n ||
    adminCatalogIndex[0]?.count !== 1n ||
    cartIndexes[0]?.count !== 4n ||
    customerIndexes[0]?.count !== 3n ||
    checkoutIndexes[0]?.count !== 6n ||
    invalidCustomerCarts[0]?.count !== 0n ||
    invalidDefaultAddresses[0]?.count !== 0n ||
    variantsWithoutInventory[0]?.count !== 0n ||
    productsWithoutValidDefault[0]?.count !== 0n ||
    inventoryWithoutTrace[0]?.count !== 0n ||
    categoryCycles[0]?.count !== 0n ||
    timestampColumns[0]?.count !== 2n ||
    cartTimestampColumns[0]?.count !== 3n ||
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
