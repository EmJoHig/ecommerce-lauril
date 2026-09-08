import "server-only";

import { getPrisma } from "@/shared/infrastructure/prisma";
import { CatalogImportService } from "../application/catalog-import";
import { PrismaCatalogImportRepository } from "./prisma-catalog-import-repository";

export function getCatalogImportService(): CatalogImportService {
  return new CatalogImportService(new PrismaCatalogImportRepository(getPrisma()));
}
