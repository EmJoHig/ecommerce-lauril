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
] as const;

async function main(): Promise<void> {
  for (const command of commands) {
    await prisma.$runCommandRaw(command);
  }
  await prisma.sequence.upsert({
    where: { id: "schema:indexes:v1" },
    update: { value: 1n },
    create: { id: "schema:indexes:v1", value: 1n },
  });
  console.info(JSON.stringify({ status: "ok", indexesEnsured: 5 }));
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
