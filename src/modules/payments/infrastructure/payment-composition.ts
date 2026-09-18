import "server-only";

import { getPrisma } from "@/shared/infrastructure/prisma";
import { PrismaPaymentAttemptRepository } from "./prisma-payment-attempt-repository";
import { PrismaPaymentEventRepository } from "./prisma-payment-event-repository";

export function getPaymentAttemptRepository(): PrismaPaymentAttemptRepository {
  return new PrismaPaymentAttemptRepository(getPrisma());
}

export function getPaymentEventRepository(): PrismaPaymentEventRepository {
  return new PrismaPaymentEventRepository(getPrisma());
}
