CREATE TABLE "customer_notes" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "content" VARCHAR(2000) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_notes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_notes_content_check"
      CHECK (char_length(btrim("content")) BETWEEN 1 AND 2000)
);

CREATE INDEX "customer_notes_customer_id_created_at_idx"
  ON "customer_notes"("customer_id", "created_at");

CREATE INDEX "customer_notes_actor_user_id_created_at_idx"
  ON "customer_notes"("actor_user_id", "created_at");

ALTER TABLE "customer_notes"
  ADD CONSTRAINT "customer_notes_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_notes"
  ADD CONSTRAINT "customer_notes_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
