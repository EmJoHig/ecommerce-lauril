import type {
  CatalogCategory,
  ListCatalogProductsInput,
  ProductCatalogRepository,
} from "./product-catalog-repository";
import type { CatalogProduct } from "../domain/product";
import { normalizeSlug } from "../domain/product";

export class CatalogService {
  constructor(private readonly products: ProductCatalogRepository) {}

  listProducts(input: ListCatalogProductsInput = {}): Promise<CatalogProduct[]> {
    const limit = Math.min(Math.max(input.limit ?? 24, 1), 100);
    return this.products.listProducts({ ...input, limit });
  }

  getProduct(slug: string): Promise<CatalogProduct | null> {
    return this.products.findBySlug(normalizeSlug(slug));
  }

  listCategories(): Promise<CatalogCategory[]> {
    return this.products.listCategories();
  }
}
