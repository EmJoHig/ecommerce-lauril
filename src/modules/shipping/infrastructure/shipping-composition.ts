import "server-only";

import { getPrisma } from "@/shared/infrastructure/prisma";
import { ShippingAdminService } from "../application/shipping-admin-service";
import { PrismaShippingRepository } from "./prisma-shipping-repository";
import { isLaurilShippingMethod } from "../domain/shipping";

export function getShippingAdminService() {
  return new ShippingAdminService(new PrismaShippingRepository(getPrisma()));
}

export function getPublicShippingMethods() {
  return new PrismaShippingRepository(getPrisma()).listActive()
    .then((methods) => methods.filter(isLaurilShippingMethod));
}
