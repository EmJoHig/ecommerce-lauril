-- CreateEnum
CREATE TYPE "cart_status" AS ENUM ('ACTIVE', 'CONVERTED', 'ABANDONED');

-- CreateTable
CREATE TABLE "carts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "guest_token_hash" CHAR(64) NOT NULL,
    "status" "cart_status" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cart_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price_snapshot_in_cents" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "carts_guest_token_hash_key" ON "carts"("guest_token_hash");
CREATE INDEX "carts_status_expires_at_idx" ON "carts"("status", "expires_at");
CREATE INDEX "carts_updated_at_idx" ON "carts"("updated_at");
CREATE UNIQUE INDEX "cart_items_cart_id_variant_id_key" ON "cart_items"("cart_id", "variant_id");
CREATE INDEX "cart_items_variant_id_idx" ON "cart_items"("variant_id");

-- AddForeignKey
ALTER TABLE "cart_items"
  ADD CONSTRAINT "cart_items_cart_id_fkey"
  FOREIGN KEY ("cart_id") REFERENCES "carts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cart_items"
  ADD CONSTRAINT "cart_items_variant_id_fkey"
  FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain constraints
ALTER TABLE "carts"
  ADD CONSTRAINT "carts_guest_token_hash_check"
  CHECK ("guest_token_hash" ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT "carts_version_non_negative_check"
  CHECK ("version" >= 0),
  ADD CONSTRAINT "carts_expiration_after_creation_check"
  CHECK ("expires_at" > "created_at");

ALTER TABLE "cart_items"
  ADD CONSTRAINT "cart_items_quantity_check"
  CHECK ("quantity" BETWEEN 1 AND 999),
  ADD CONSTRAINT "cart_items_price_snapshot_check"
  CHECK ("unit_price_snapshot_in_cents" >= 0);
