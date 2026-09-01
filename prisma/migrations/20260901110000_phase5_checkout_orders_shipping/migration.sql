-- CreateEnum
CREATE TYPE "shipping_method_type" AS ENUM ('PICKUP', 'FLAT_RATE', 'LOCAL_DELIVERY', 'TO_COORDINATE');
CREATE TYPE "order_status" AS ENUM (
  'PENDING_PAYMENT', 'PAID', 'PREPARING', 'READY_TO_SHIP', 'SHIPPED',
  'DELIVERED', 'CANCELLED', 'PAYMENT_REJECTED', 'REFUNDED', 'PARTIALLY_REFUNDED'
);

-- CreateTable
CREATE TABLE "shipping_methods" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" VARCHAR(80) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" VARCHAR(500),
  "type" "shipping_method_type" NOT NULL,
  "cost_in_cents" BIGINT NOT NULL DEFAULT 0,
  "requires_address" BOOLEAN NOT NULL DEFAULT true,
  "minimum_subtotal_in_cents" BIGINT,
  "free_shipping_from_in_cents" BIGINT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "shipping_methods_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "orders" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_number" BIGSERIAL NOT NULL,
  "cart_id" UUID NOT NULL,
  "customer_id" UUID,
  "shipping_method_id" UUID NOT NULL,
  "checkout_key_hash" CHAR(64) NOT NULL,
  "guest_access_token_hash" CHAR(64),
  "status" "order_status" NOT NULL DEFAULT 'PENDING_PAYMENT',
  "currency" CHAR(3) NOT NULL DEFAULT 'ARS',
  "buyer_first_name" VARCHAR(100) NOT NULL,
  "buyer_last_name" VARCHAR(100) NOT NULL,
  "buyer_email" VARCHAR(320) NOT NULL,
  "buyer_phone" VARCHAR(30) NOT NULL,
  "shipping_method_name" VARCHAR(120) NOT NULL,
  "shipping_method_type" "shipping_method_type" NOT NULL,
  "shipping_requires_address" BOOLEAN NOT NULL,
  "shipping_recipient_first_name" VARCHAR(100),
  "shipping_recipient_last_name" VARCHAR(100),
  "shipping_phone" VARCHAR(30),
  "shipping_street" VARCHAR(160),
  "shipping_street_number" VARCHAR(30),
  "shipping_floor_apartment" VARCHAR(80),
  "shipping_city" VARCHAR(120),
  "shipping_province" VARCHAR(120),
  "shipping_postal_code" VARCHAR(20),
  "shipping_references" VARCHAR(500),
  "items_subtotal_in_cents" BIGINT NOT NULL,
  "shipping_amount_in_cents" BIGINT NOT NULL,
  "discount_amount_in_cents" BIGINT NOT NULL DEFAULT 0,
  "total_in_cents" BIGINT NOT NULL,
  "payment_expires_at" TIMESTAMPTZ(3) NOT NULL,
  "reservation_released_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

ALTER SEQUENCE "orders_order_number_seq" RESTART WITH 10001;

CREATE TABLE "order_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "product_id" UUID,
  "product_variant_id" UUID,
  "product_name" VARCHAR(200) NOT NULL,
  "variant_name" VARCHAR(160) NOT NULL,
  "sku" VARCHAR(100) NOT NULL,
  "unit_price_in_cents" BIGINT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "subtotal_in_cents" BIGINT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_status_history" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "from_status" "order_status",
  "to_status" "order_status" NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "actor_user_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- Unique indexes
CREATE UNIQUE INDEX "shipping_methods_code_key" ON "shipping_methods"("code");
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");
CREATE UNIQUE INDEX "orders_cart_id_key" ON "orders"("cart_id");
CREATE UNIQUE INDEX "orders_checkout_key_hash_key" ON "orders"("checkout_key_hash");
CREATE UNIQUE INDEX "orders_guest_access_token_hash_key" ON "orders"("guest_access_token_hash");

-- Query indexes
CREATE INDEX "shipping_methods_is_active_sort_order_name_idx" ON "shipping_methods"("is_active", "sort_order", "name");
CREATE INDEX "orders_customer_id_created_at_idx" ON "orders"("customer_id", "created_at");
CREATE INDEX "orders_status_payment_expires_at_idx" ON "orders"("status", "payment_expires_at");
CREATE INDEX "orders_created_at_idx" ON "orders"("created_at");
CREATE INDEX "order_items_order_id_created_at_idx" ON "order_items"("order_id", "created_at");
CREATE INDEX "order_items_product_variant_id_idx" ON "order_items"("product_variant_id");
CREATE INDEX "order_status_history_order_id_created_at_idx" ON "order_status_history"("order_id", "created_at");
CREATE INDEX "order_status_history_to_status_created_at_idx" ON "order_status_history"("to_status", "created_at");

-- Foreign keys
ALTER TABLE "orders" ADD CONSTRAINT "orders_cart_id_fkey"
  FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_method_id_fkey"
  FOREIGN KEY ("shipping_method_id") REFERENCES "shipping_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_variant_id_fkey"
  FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Domain constraints
ALTER TABLE "shipping_methods"
  ADD CONSTRAINT "shipping_methods_code_format_check"
    CHECK ("code" = upper(btrim("code")) AND "code" ~ '^[A-Z0-9][A-Z0-9_-]{1,79}$'),
  ADD CONSTRAINT "shipping_methods_name_not_blank_check"
    CHECK (char_length(btrim("name")) BETWEEN 1 AND 120),
  ADD CONSTRAINT "shipping_methods_amounts_check"
    CHECK (
      "cost_in_cents" >= 0
      AND ("minimum_subtotal_in_cents" IS NULL OR "minimum_subtotal_in_cents" >= 0)
      AND ("free_shipping_from_in_cents" IS NULL OR "free_shipping_from_in_cents" >= 0)
      AND "sort_order" >= 0
    ),
  ADD CONSTRAINT "shipping_methods_address_policy_check"
    CHECK (
      ("type" = 'PICKUP' AND "requires_address" = false)
      OR ("type" = 'LOCAL_DELIVERY' AND "requires_address" = true)
      OR ("type" = 'TO_COORDINATE' AND "requires_address" = false)
      OR "type" = 'FLAT_RATE'
    );

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_owner_access_check"
    CHECK (("customer_id" IS NULL) <> ("guest_access_token_hash" IS NULL)),
  ADD CONSTRAINT "orders_buyer_snapshot_check"
    CHECK (
      char_length(btrim("buyer_first_name")) BETWEEN 1 AND 100
      AND char_length(btrim("buyer_last_name")) BETWEEN 1 AND 100
      AND "buyer_email" = lower(btrim("buyer_email"))
      AND char_length(btrim("buyer_phone")) BETWEEN 6 AND 30
    ),
  ADD CONSTRAINT "orders_address_snapshot_check"
    CHECK (
      (
        "shipping_requires_address" = true
        AND "shipping_recipient_first_name" IS NOT NULL
        AND "shipping_recipient_last_name" IS NOT NULL
        AND "shipping_phone" IS NOT NULL
        AND "shipping_street" IS NOT NULL
        AND "shipping_street_number" IS NOT NULL
        AND "shipping_city" IS NOT NULL
        AND "shipping_province" IS NOT NULL
        AND "shipping_postal_code" IS NOT NULL
      )
      OR (
        "shipping_requires_address" = false
        AND "shipping_recipient_first_name" IS NULL
        AND "shipping_recipient_last_name" IS NULL
        AND "shipping_phone" IS NULL
        AND "shipping_street" IS NULL
        AND "shipping_street_number" IS NULL
        AND "shipping_floor_apartment" IS NULL
        AND "shipping_city" IS NULL
        AND "shipping_province" IS NULL
        AND "shipping_postal_code" IS NULL
        AND "shipping_references" IS NULL
      )
    ),
  ADD CONSTRAINT "orders_totals_check"
    CHECK (
      "items_subtotal_in_cents" >= 0
      AND "shipping_amount_in_cents" >= 0
      AND "discount_amount_in_cents" >= 0
      AND "discount_amount_in_cents" <= "items_subtotal_in_cents" + "shipping_amount_in_cents"
      AND "total_in_cents" = "items_subtotal_in_cents" + "shipping_amount_in_cents" - "discount_amount_in_cents"
    ),
  ADD CONSTRAINT "orders_number_currency_check"
    CHECK ("order_number" >= 10001 AND "currency" = 'ARS'),
  ADD CONSTRAINT "orders_expiration_check"
    CHECK ("payment_expires_at" > "created_at");

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_snapshot_check"
    CHECK (
      char_length(btrim("product_name")) BETWEEN 1 AND 200
      AND char_length(btrim("variant_name")) BETWEEN 1 AND 160
      AND char_length(btrim("sku")) BETWEEN 1 AND 100
      AND "unit_price_in_cents" >= 0
      AND "quantity" BETWEEN 1 AND 999
      AND "subtotal_in_cents" = "unit_price_in_cents" * "quantity"
    );

ALTER TABLE "order_status_history"
  ADD CONSTRAINT "order_status_history_transition_check"
    CHECK (("from_status" IS NULL OR "from_status" <> "to_status") AND char_length(btrim("reason")) BETWEEN 3 AND 500);
