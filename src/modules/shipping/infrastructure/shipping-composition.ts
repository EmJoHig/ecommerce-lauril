import "server-only";

import { getPrisma } from "@/shared/infrastructure/prisma";
import { ShippingAdminService } from "../application/shipping-admin-service";
import { PrismaShippingRepository } from "./prisma-shipping-repository";

export function getShippingAdminService() {
  return new ShippingAdminService(new PrismaShippingRepository(getPrisma()));
}
