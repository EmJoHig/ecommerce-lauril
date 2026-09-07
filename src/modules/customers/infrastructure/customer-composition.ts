import "server-only";

import { getServerEnv } from "@/shared/infrastructure/env";
import { getPrisma } from "@/shared/infrastructure/prisma";
import { CustomerService } from "../application/customer-service";
import { createEmailSender } from "./email-sender-composition";
import { PrismaCustomerRepository } from "./prisma-customer-repository";

export function getCustomerService(): CustomerService {
  const env = getServerEnv();
  return new CustomerService(
    new PrismaCustomerRepository(getPrisma()),
    createEmailSender(env),
    env.BCRYPT_COST,
    env.CUSTOMER_SESSION_TTL_DAYS,
    env.PASSWORD_RESET_TTL_MINUTES,
  );
}
