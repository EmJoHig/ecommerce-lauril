-- Align the persisted slug size with the domain normalization limit.
ALTER TABLE "products"
  ALTER COLUMN "slug" TYPE VARCHAR(180);

-- Inventory is an aggregate with its own creation timestamp.
ALTER TABLE "inventory"
  ADD COLUMN "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- SKU is a stable external identifier: trimmed, uppercase and URL/import safe.
ALTER TABLE "product_variants"
  ADD CONSTRAINT "product_variants_sku_normalized_check"
  CHECK (
    "sku" = upper(btrim("sku"))
    AND "sku" ~ '^[A-Z0-9][A-Z0-9._-]*$'
  );

-- The former two-column index did not match the available-stock predicate.
DROP INDEX "inventory_stock_on_hand_minimum_stock_idx";
CREATE INDEX "inventory_low_stock_idx"
  ON "inventory" (("stock_on_hand" - "stock_reserved" - "minimum_stock"))
  WHERE ("stock_on_hand" - "stock_reserved") <= "minimum_stock";
