import "server-only";
import { getPrisma } from "@/shared/infrastructure/prisma";
import { InventoryAdminService } from "../application/inventory-admin-service";
import { PrismaInventoryAdminRepository } from "./prisma-inventory-admin-repository";

export function getInventoryAdminService(): InventoryAdminService {
  return new InventoryAdminService(new PrismaInventoryAdminRepository(getPrisma()));
}
