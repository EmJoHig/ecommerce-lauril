import "dotenv/config";

import { PrismaClient } from "../src/generated/prisma/client";

if (!process.env.MONGODB_URI) {
  throw new Error("MONGODB_URI es obligatoria.");
}

const prisma = new PrismaClient();

const commands = [
  {
    createIndexes: "product_variants",
    indexes: [
      {
        key: { product_id: 1 },
        name: "product_variants_one_default_per_product_key",
        unique: true,
        partialFilterExpression: { is_default: true },
      },
    ],
  },
  {
    createIndexes: "customer_addresses",
    indexes: [
      {
        key: { customer_id: 1 },
        name: "customer_addresses_one_default_key",
        unique: true,
        partialFilterExpression: { is_default: true },
      },
    ],
  },
  {
    createIndexes: "carts",
    indexes: [
      {
        key: { guest_token_hash: 1 },
        name: "carts_guest_token_hash_key",
        unique: true,
        partialFilterExpression: { guest_token_hash: { $type: "string" } },
      },
      {
        key: { customer_id: 1 },
        name: "carts_one_active_per_customer_key",
        unique: true,
        partialFilterExpression: {
          customer_id: { $type: "string" },
          status: "ACTIVE",
        },
      },
    ],
  },
  {
    createIndexes: "orders",
    indexes: [
      {
        key: { guest_access_token_hash: 1 },
        name: "orders_guest_access_token_hash_key",
        unique: true,
        partialFilterExpression: { guest_access_token_hash: { $type: "string" } },
      },
    ],
  },
  {
    createIndexes: "payment_attempts",
    indexes: [
      {
        key: { provider: 1, provider_resource_id: 1 },
        name: "payment_attempts_provider_resource_id_key",
        unique: true,
        partialFilterExpression: { provider_resource_id: { $type: "string" } },
      },
      {
        key: { order_id: 1 },
        name: "payment_attempts_one_active_per_order_key",
        unique: true,
        partialFilterExpression: { status: { $in: ["CREATED", "PENDING"] } },
      },
    ],
  },
  {
    createIndexes: "payment_refunds",
    indexes: [
      {
        key: { payment_attempt_id: 1 },
        name: "payment_refunds_one_active_per_attempt_key",
        unique: true,
        partialFilterExpression: { status: { $in: ["CREATED", "SUBMITTED"] } },
      },
      {
        key: { provider: 1, provider_refund_id: 1 },
        name: "payment_refunds_provider_refund_id_key",
        unique: true,
        partialFilterExpression: { provider_refund_id: { $type: "string" } },
      },
    ],
  },
  {
    createIndexes: "inventory_movements",
    indexes: [
      {
        key: { inventory_id: 1, type: 1, reference_type: 1, reference_id: 1 },
        name: "inventory_movements_order_sale_once_key",
        unique: true,
        partialFilterExpression: {
          type: "SALE",
          reference_type: "ORDER",
          reference_id: { $type: "string" },
        },
      },
    ],
  },
] as const;

async function main(): Promise<void> {
  for (const command of commands) {
    await prisma.$runCommandRaw(command);
  }
  await prisma.sequence.upsert({
    where: { id: "schema:indexes:v1" },
    update: { value: 5n },
    create: { id: "schema:indexes:v1", value: 5n },
  });
  console.info(JSON.stringify({ status: "ok", indexesEnsured: 10 }));
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
