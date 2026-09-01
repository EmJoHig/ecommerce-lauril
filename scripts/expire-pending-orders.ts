import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { CheckoutService } from "../src/modules/orders/application/checkout-service";
import { PrismaOrderRepository } from "../src/modules/orders/infrastructure/prisma-order-repository";
import { CustomShippingProvider } from "../src/modules/shipping/application/custom-shipping-provider";
import { PrismaShippingRepository } from "../src/modules/shipping/infrastructure/prisma-shipping-repository";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL es obligatoria.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

try {
  const repository = new PrismaOrderRepository(prisma);
  const expired = await new CheckoutService(repository, new CustomShippingProvider(new PrismaShippingRepository(prisma))).expirePendingOrders();
  console.info(JSON.stringify({ status: "ok", expired }));
} finally {
  await prisma.$disconnect();
}
