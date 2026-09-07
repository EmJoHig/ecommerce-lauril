import "server-only";
import { getPrisma } from "@/shared/infrastructure/prisma";
import { CustomerAdminService } from "../application/customer-admin-service";
import { PrismaCustomerAdminRepository } from "./prisma-customer-admin-repository";

export function getCustomerAdminService(): CustomerAdminService {
  return new CustomerAdminService(new PrismaCustomerAdminRepository(getPrisma()));
}
