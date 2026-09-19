import "server-only";

import { getPrisma } from "@/shared/infrastructure/prisma";
import { getServerEnv } from "@/shared/infrastructure/env";
import { PrismaOrderRepository } from "@/modules/orders/infrastructure/prisma-order-repository";
import { StartPaymentCheckout } from "../application/start-payment-checkout";
import { MercadoPagoOrdersGateway } from "./mercado-pago-orders-gateway";
import { PrismaPaymentAttemptRepository } from "./prisma-payment-attempt-repository";
import { PrismaPaymentEventRepository } from "./prisma-payment-event-repository";
import { ProcessMercadoPagoWebhook } from "../application/process-mercado-pago-webhook";
import { PrismaPaymentConfirmationUnitOfWork } from "./prisma-payment-confirmation-unit-of-work";
import { PrismaPaymentRefundRepository } from "./prisma-payment-refund-repository";
import { PrismaAdminPaymentRefundRepository } from "./prisma-admin-payment-refund-repository";
import { RequestPaymentRefund } from "../application/request-payment-refund";

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

export function getMercadoPagoWebhookProcessor(): ProcessMercadoPagoWebhook {
  const env = getServerEnv();
  if (!env.MERCADO_PAGO_ENABLED) throw new Error("Mercado Pago está deshabilitado.");
  if (!env.MERCADO_PAGO_ACCESS_TOKEN) {
    throw new Error("Mercado Pago está habilitado pero el token server-side no está configurado.");
  }
  const prisma = getPrisma();
  return new ProcessMercadoPagoWebhook(
    new PrismaPaymentAttemptRepository(prisma),
    new PrismaPaymentEventRepository(prisma),
    new MercadoPagoOrdersGateway(env.MERCADO_PAGO_ACCESS_TOKEN, env.APP_URL),
    new PrismaPaymentConfirmationUnitOfWork(prisma),
  );
}

export function getRequestPaymentRefund(): RequestPaymentRefund {
  const env = getServerEnv();
  if (!env.MERCADO_PAGO_ENABLED || !env.MERCADO_PAGO_ACCESS_TOKEN) {
    throw new Error("Mercado Pago no está disponible.");
  }
  const prisma = getPrisma();
  return new RequestPaymentRefund(
    new PrismaAdminPaymentRefundRepository(prisma),
    new PrismaPaymentRefundRepository(prisma),
    new MercadoPagoOrdersGateway(env.MERCADO_PAGO_ACCESS_TOKEN, env.APP_URL),
  );
}

export async function getAdminPaymentRefundSummary(orderId: string) {
  if (!isMercadoPagoCheckoutAvailable()) return null;
  const payment = await new PrismaAdminPaymentRefundRepository(getPrisma()).findRefundablePayment(orderId);
  if (!payment || !["PAID", "PARTIALLY_REFUNDED"].includes(payment.orderStatus)) return null;
  return {
    amountInCents: payment.attempt.amountInCents,
    refundedAmountInCents: payment.attempt.refundedAmountInCents,
  };
}
