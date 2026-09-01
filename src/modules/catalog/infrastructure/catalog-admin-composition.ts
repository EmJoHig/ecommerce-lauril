import { getPrisma } from "@/shared/infrastructure/prisma";
import { CatalogAdminService } from "../application/catalog-admin-service";
import { LocalObjectStorage } from "./local-object-storage";
import { PrismaCatalogAdminRepository } from "./prisma-catalog-admin-repository";

export function getCatalogAdminService(): CatalogAdminService {
  return new CatalogAdminService(
    new PrismaCatalogAdminRepository(getPrisma()),
    new LocalObjectStorage(),
  );
}
