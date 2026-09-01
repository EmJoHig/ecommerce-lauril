import "server-only";

import { getServerEnv } from "@/shared/infrastructure/env";
import { getPrisma } from "@/shared/infrastructure/prisma";
import { CustomerService } from "../application/customer-service";
import { CustomerEmailSender } from "./customer-email-sender";
import { PrismaCustomerRepository } from "./prisma-customer-repository";

export function getCustomerService(): CustomerService {
  const env = getServerEnv();
  return new CustomerService(
    new PrismaCustomerRepository(getPrisma()),
    new CustomerEmailSender(env.APP_URL, env.NODE_ENV === "development"),
    env.BCRYPT_COST,
    env.CUSTOMER_SESSION_TTL_DAYS,
    env.PASSWORD_RESET_TTL_MINUTES,
  );
}
