-- Supports paginated administrative catalog queries by status and recency.
CREATE INDEX "products_status_updated_at_idx"
  ON "products"("status", "updated_at");
