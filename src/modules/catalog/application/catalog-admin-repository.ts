export type ProductStatusInput = "DRAFT" | "ACTIVE" | "INACTIVE";
export type ProductSort = "updated-desc" | "updated-asc" | "name-asc" | "name-desc";

export type AdminProductListQuery = Readonly<{
  page: number;
  pageSize: number;
  search?: string;
  status?: ProductStatusInput;
  categoryId?: string;
  sort: ProductSort;
}>;

export type AdminProductListItem = Readonly<{
  id: string;
  name: string;
  slug: string;
  status: ProductStatusInput | "ARCHIVED";
  imageUrl: string | null;
  imageAlt: string | null;
  primarySku: string;
  categoryNames: string[];
  priceInCents: bigint;
  availableStock: number;
  updatedAt: Date;
}>;

export type AdminProductPage = Readonly<{
  items: AdminProductListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}>;

export type ProductVariantCommand = Readonly<{
  id?: string;
  sku: string;
  name: string;
  priceInCents: bigint;
  promotionalPriceInCents: bigint | null;
  costInCents: bigint | null;
  isDefault: boolean;
  isActive: boolean;
  initialStock: number;
  minimumStock: number;
}>;

export type ProductImageCommand = Readonly<{
  id?: string;
  objectKey?: string;
  url?: string;
  altText: string;
  sortOrder: number;
}>;

export type SaveProductCommand = Readonly<{
  id?: string;
  name: string;
  slug: string;
  shortDescription: string | null;
  description: string | null;
  status: ProductStatusInput;
  featured: boolean;
  categoryIds: string[];
  variants: ProductVariantCommand[];
  existingImages: Array<Pick<ProductImageCommand, "id" | "altText" | "sortOrder"> & { id: string }>;
  newImages: Array<Required<Pick<ProductImageCommand, "objectKey" | "url" | "altText" | "sortOrder">>>;
  actorUserId: string;
}>;

export type AdminProductEditor = Readonly<{
  id: string;
  name: string;
  slug: string;
  shortDescription: string | null;
  description: string | null;
  status: ProductStatusInput | "ARCHIVED";
  featured: boolean;
  categoryIds: string[];
  images: Array<{ id: string; url: string; objectKey: string; altText: string; sortOrder: number }>;
  variants: Array<{
    id: string;
    sku: string;
    name: string;
    priceInCents: bigint;
    promotionalPriceInCents: bigint | null;
    costInCents: bigint | null;
    isDefault: boolean;
    isActive: boolean;
    stockOnHand: number;
    stockReserved: number;
    minimumStock: number;
  }>;
}>;

export type AdminCategory = Readonly<{
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  productCount: number;
  updatedAt: Date;
}>;

export type SaveCategoryCommand = Readonly<{
  id?: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  actorUserId: string;
}>;

export interface CatalogAdminRepository {
  listProducts(query: AdminProductListQuery): Promise<AdminProductPage>;
  findProduct(id: string): Promise<AdminProductEditor | null>;
  createProduct(command: SaveProductCommand): Promise<{ id: string }>;
  updateProduct(command: SaveProductCommand & { id: string }): Promise<{
    id: string;
    removedObjectKeys: string[];
  }>;
  setProductStatus(
    id: string,
    status: "ACTIVE" | "INACTIVE",
    actorUserId: string,
  ): Promise<void>;
  listCategories(): Promise<AdminCategory[]>;
  findCategory(id: string): Promise<AdminCategory | null>;
  createCategory(command: SaveCategoryCommand): Promise<{ id: string }>;
  updateCategory(command: SaveCategoryCommand & { id: string }): Promise<{ id: string }>;
  setCategoryActive(id: string, isActive: boolean, actorUserId: string): Promise<void>;
}
