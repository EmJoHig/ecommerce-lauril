import "server-only";

import { getPrisma } from "@/shared/infrastructure/prisma";
import { getServerEnv } from "@/shared/infrastructure/env";
import { PrismaOrderRepository } from "@/modules/orders/infrastructure/prisma-order-repository";
import { StartPaymentCheckout } from "../application/start-payment-checkout";
import { MercadoPagoOrdersGateway } from "./mercado-pago-orders-gateway";
import { PrismaPaymentAttemptRepository } from "./prisma-payment-attempt-repository";
import { PrismaPaymentEventRepository } from "./prisma-payment-event-repository";

export function getPaymentAttemptRepository(): PrismaPaymentAttemptRepository {
  return new PrismaPaymentAttemptRepository(getPrisma());
}

export function getPaymentEventRepository(): PrismaPaymentEventRepository {
  return new PrismaPaymentEventRepository(getPrisma());
}

export function isMercadoPagoCheckoutAvailable(): boolean {
  const env = getServerEnv();
  return env.MERCADO_PAGO_ENABLED && Boolean(env.MERCADO_PAGO_ACCESS_TOKEN);
}

export function getStartPaymentCheckout(): StartPaymentCheckout {
  const env = getServerEnv();
  if (!env.MERCADO_PAGO_ENABLED) {
    throw new Error("Mercado Pago está deshabilitado.");
  }
  if (!env.MERCADO_PAGO_ACCESS_TOKEN) {
    throw new Error("Mercado Pago está habilitado pero MERCADO_PAGO_ACCESS_TOKEN no está configurado.");
  }
  const prisma = getPrisma();
  return new StartPaymentCheckout(
    new PrismaOrderRepository(prisma),
    new PrismaPaymentAttemptRepository(prisma),
    new MercadoPagoOrdersGateway(env.MERCADO_PAGO_ACCESS_TOKEN, env.APP_URL),
  );
}
