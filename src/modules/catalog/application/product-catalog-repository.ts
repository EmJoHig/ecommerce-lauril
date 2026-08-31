import type { CatalogProduct } from "../domain/product";

export type ListCatalogProductsInput = Readonly<{
  categorySlug?: string;
  featured?: boolean;
  limit?: number;
}>;

export type CatalogCategory = Readonly<{
  id: string;
  name: string;
  slug: string;
  description: string | null;
}>;

export interface ProductCatalogRepository {
  listProducts(input?: ListCatalogProductsInput): Promise<CatalogProduct[]>;
  findBySlug(slug: string): Promise<CatalogProduct | null>;
  listCategories(): Promise<CatalogCategory[]>;
}
