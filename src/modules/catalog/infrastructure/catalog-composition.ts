import { getPrisma } from "@/shared/infrastructure/prisma";
import { CatalogService } from "../application/catalog-service";
import { PrismaProductCatalogRepository } from "./prisma-product-catalog-repository";

export function getCatalogService(): CatalogService {
  return new CatalogService(new PrismaProductCatalogRepository(getPrisma()));
}
