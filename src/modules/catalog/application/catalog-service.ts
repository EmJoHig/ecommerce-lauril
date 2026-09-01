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

  listProductPage(input: ListCatalogProductsInput = {}) {
    const page = Math.max(input.page ?? 1, 1);
    const pageSize = Math.min(Math.max(input.pageSize ?? 12, 1), 48);
    return this.products.listProductPage({
      ...input,
      page,
      pageSize,
      ...(input.search?.trim() ? { search: input.search.trim().slice(0, 200) } : {}),
    });
  }

  getProduct(slug: string): Promise<CatalogProduct | null> {
    try {
      return this.products.findBySlug(normalizeSlug(slug));
    } catch {
      return Promise.resolve(null);
    }
  }

  listCategories(): Promise<CatalogCategory[]> {
    return this.products.listCategories();
  }
}
