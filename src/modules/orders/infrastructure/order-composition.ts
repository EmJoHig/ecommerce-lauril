import "server-only";

import { getPrisma } from "@/shared/infrastructure/prisma";
import { getServerEnv } from "@/shared/infrastructure/env";
import { CustomShippingProvider } from "@/modules/shipping/application/custom-shipping-provider";
import { PrismaShippingRepository } from "@/modules/shipping/infrastructure/prisma-shipping-repository";
import { CheckoutService } from "../application/checkout-service";
import { OrderQueryService } from "../application/order-query-service";
import { PrismaOrderRepository } from "./prisma-order-repository";

export function getOrderRepository() {
  return new PrismaOrderRepository(getPrisma());
}

export function getCheckoutService() {
  const prisma = getPrisma();
  const shipping = new PrismaShippingRepository(prisma);
  return new CheckoutService(
    new PrismaOrderRepository(prisma),
    new CustomShippingProvider(shipping),
    getServerEnv().ORDER_RESERVATION_MINUTES,
  );
}

export function getOrderQueryService() {
  return new OrderQueryService(new PrismaOrderRepository(getPrisma()));
}
