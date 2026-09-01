-- CreateTable
CREATE TABLE "order_notes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "content" VARCHAR(2000) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_notes_pkey" PRIMARY KEY ("id")
);

-- Query indexes
CREATE INDEX "orders_status_created_at_idx" ON "orders"("status", "created_at");
CREATE INDEX "orders_shipping_method_id_created_at_idx" ON "orders"("shipping_method_id", "created_at");
CREATE INDEX "order_notes_order_id_created_at_idx" ON "order_notes"("order_id", "created_at");
CREATE INDEX "order_notes_actor_user_id_created_at_idx" ON "order_notes"("actor_user_id", "created_at");

-- Foreign keys
ALTER TABLE "order_notes" ADD CONSTRAINT "order_notes_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_notes" ADD CONSTRAINT "order_notes_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain constraints
ALTER TABLE "order_notes"
  ADD CONSTRAINT "order_notes_content_not_blank_check"
    CHECK (char_length(btrim("content")) BETWEEN 1 AND 2000);
