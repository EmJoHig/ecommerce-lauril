import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { CheckoutService } from "../src/modules/orders/application/checkout-service";
import { PrismaOrderRepository } from "../src/modules/orders/infrastructure/prisma-order-repository";
import { CustomShippingProvider } from "../src/modules/shipping/application/custom-shipping-provider";
import { PrismaShippingRepository } from "../src/modules/shipping/infrastructure/prisma-shipping-repository";

const job = "expire-pending-orders";

try {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL es obligatoria.");

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  let expired: number;
  try {
    const repository = new PrismaOrderRepository(prisma);
    expired = await new CheckoutService(
      repository,
      new CustomShippingProvider(new PrismaShippingRepository(prisma)),
    ).expirePendingOrders();
  } finally {
    await prisma.$disconnect();
  }
  console.info(JSON.stringify({ job, status: "ok", expired }));
} catch {
  console.error(JSON.stringify({ job, status: "error" }));
  process.exitCode = 1;
}
