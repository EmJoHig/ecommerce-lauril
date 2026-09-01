-- CreateEnum
CREATE TYPE "customer_status" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "phone" VARCHAR(30) NOT NULL,
    "document" VARCHAR(50),
    "status" "customer_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_addresses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" UUID NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "recipient_first_name" VARCHAR(100) NOT NULL,
    "recipient_last_name" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(30) NOT NULL,
    "street" VARCHAR(160) NOT NULL,
    "street_number" VARCHAR(30) NOT NULL,
    "floor_apartment" VARCHAR(80),
    "city" VARCHAR(120) NOT NULL,
    "province" VARCHAR(120) NOT NULL,
    "postal_code" VARCHAR(20) NOT NULL,
    "references" VARCHAR(500),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "carts" ALTER COLUMN "guest_token_hash" DROP NOT NULL;
ALTER TABLE "carts" ADD COLUMN "customer_id" UUID;

-- Indexes
CREATE UNIQUE INDEX "customers_user_id_key" ON "customers"("user_id");
CREATE INDEX "customers_status_created_at_idx" ON "customers"("status", "created_at");
CREATE INDEX "customer_addresses_customer_id_is_default_created_at_idx"
  ON "customer_addresses"("customer_id", "is_default", "created_at");
CREATE UNIQUE INDEX "customer_addresses_one_default_key"
  ON "customer_addresses"("customer_id") WHERE "is_default" = true;
CREATE INDEX "carts_customer_id_status_updated_at_idx"
  ON "carts"("customer_id", "status", "updated_at");
CREATE UNIQUE INDEX "carts_one_active_per_customer_key"
  ON "carts"("customer_id")
  WHERE "customer_id" IS NOT NULL AND "status" = 'ACTIVE';

-- Foreign keys
ALTER TABLE "customers"
  ADD CONSTRAINT "customers_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_addresses"
  ADD CONSTRAINT "customer_addresses_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "carts"
  ADD CONSTRAINT "carts_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain constraints
ALTER TABLE "customers"
  ADD CONSTRAINT "customers_phone_not_blank_check"
  CHECK (char_length(btrim("phone")) BETWEEN 6 AND 30),
  ADD CONSTRAINT "customers_document_not_blank_check"
  CHECK ("document" IS NULL OR char_length(btrim("document")) BETWEEN 5 AND 50);

ALTER TABLE "customer_addresses"
  ADD CONSTRAINT "customer_addresses_required_text_check"
  CHECK (
    char_length(btrim("label")) BETWEEN 1 AND 80
    AND char_length(btrim("recipient_first_name")) BETWEEN 1 AND 100
    AND char_length(btrim("recipient_last_name")) BETWEEN 1 AND 100
    AND char_length(btrim("phone")) BETWEEN 6 AND 30
    AND char_length(btrim("street")) BETWEEN 1 AND 160
    AND char_length(btrim("street_number")) BETWEEN 1 AND 30
    AND char_length(btrim("city")) BETWEEN 1 AND 120
    AND char_length(btrim("province")) BETWEEN 1 AND 120
    AND char_length(btrim("postal_code")) BETWEEN 1 AND 20
  );

ALTER TABLE "carts"
  ADD CONSTRAINT "carts_exactly_one_owner_check"
  CHECK (("guest_token_hash" IS NULL) <> ("customer_id" IS NULL));
