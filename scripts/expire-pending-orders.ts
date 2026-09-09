import "dotenv/config";

import { PrismaClient } from "../src/generated/prisma/client";
import { CheckoutService } from "../src/modules/orders/application/checkout-service";
import { PrismaOrderRepository } from "../src/modules/orders/infrastructure/prisma-order-repository";
import { CustomShippingProvider } from "../src/modules/shipping/application/custom-shipping-provider";
import { PrismaShippingRepository } from "../src/modules/shipping/infrastructure/prisma-shipping-repository";

const job = "expire-pending-orders";

try {
  const mongodbUri = process.env.MONGODB_URI;
  if (!mongodbUri) throw new Error("MONGODB_URI es obligatoria.");

  const prisma = new PrismaClient();
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
