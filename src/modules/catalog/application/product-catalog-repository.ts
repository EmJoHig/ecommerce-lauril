import type { CatalogProduct } from "../domain/product";

export type ListCatalogProductsInput = Readonly<{
  categorySlug?: string;
  featured?: boolean;
  limit?: number;
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: "featured" | "newest" | "name-asc" | "name-desc";
}>;

export type CatalogProductPage = Readonly<{
  items: CatalogProduct[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}>;

export type CatalogCategory = Readonly<{
  id: string;
  name: string;
  slug: string;
  description: string | null;
}>;

export interface ProductCatalogRepository {
  listProducts(input?: ListCatalogProductsInput): Promise<CatalogProduct[]>;
  listProductPage(input: ListCatalogProductsInput): Promise<CatalogProductPage>;
  findBySlug(slug: string): Promise<CatalogProduct | null>;
  listCategories(): Promise<CatalogCategory[]>;
}
