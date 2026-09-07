import { getServerEnv } from "@/shared/infrastructure/env";
import { getPrisma } from "@/shared/infrastructure/prisma";
import { CatalogAdminService } from "../application/catalog-admin-service";
import { createObjectStorage } from "./object-storage-composition";
import { PrismaCatalogAdminRepository } from "./prisma-catalog-admin-repository";

export function getCatalogAdminService(): CatalogAdminService {
  return new CatalogAdminService(
    new PrismaCatalogAdminRepository(getPrisma()),
    createObjectStorage(getServerEnv()),
  );
}
