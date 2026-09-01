import { z } from "zod";
import { ConflictError, NotFoundError, ValidationError } from "@/shared/domain/errors";
import { parseMoneyInputToCents } from "@/shared/domain/money";
import { normalizeSku, normalizeSlug } from "../domain/product";
import type {
  AdminProductListQuery,
  CatalogAdminRepository,
  ProductSort,
  ProductStatusInput,
  SaveCategoryCommand,
  SaveProductCommand,
} from "./catalog-admin-repository";
import type { ObjectStorage, ObjectUpload } from "./object-storage";

const optionalText = (maximum: number) =>
  z.string().trim().max(maximum).transform((value) => value || null);

const requiredMoneyInput = () =>
  z.string().trim().superRefine((value, context) => {
    try {
      parseMoneyInputToCents(value);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "Importe inválido.",
      });
    }
  }).transform((value) => parseMoneyInputToCents(value));

const optionalMoneyInput = () =>
  z.string().trim().superRefine((value, context) => {
    if (value === "") return;
    try {
      parseMoneyInputToCents(value);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "Importe inválido.",
      });
    }
  }).transform((value) => (value === "" ? null : parseMoneyInputToCents(value)));

export const productFormSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2).max(200),
  slug: z.string().trim().min(1).max(180),
  shortDescription: optionalText(500),
  description: optionalText(20_000),
  status: z.enum(["DRAFT", "ACTIVE", "INACTIVE"]),
  featured: z.boolean(),
  categoryIds: z.array(z.uuid()).max(50),
  variants: z.array(z.object({
    id: z.uuid().optional(),
    sku: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(160),
    price: requiredMoneyInput(),
    promotionalPrice: optionalMoneyInput(),
    cost: optionalMoneyInput(),
    isDefault: z.boolean(),
    isActive: z.boolean(),
    initialStock: z.number().int().min(0).max(2_000_000_000),
    minimumStock: z.number().int().min(0).max(2_000_000_000),
  })).min(1).max(100),
  existingImages: z.array(z.object({
    id: z.uuid(),
    altText: z.string().trim().min(1).max(250),
    sortOrder: z.number().int().min(0).max(10_000),
  })).max(30),
});

export type ProductFormInput = z.input<typeof productFormSchema>;

export const categoryFormSchema = z.object({
  id: z.uuid().optional(),
  parentId: z.uuid().nullable(),
  name: z.string().trim().min(2).max(160),
  slug: z.string().trim().min(1).max(180),
  description: optionalText(10_000),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(1_000_000),
});

export type CategoryFormInput = z.input<typeof categoryFormSchema>;

export class CatalogAdminService {
  constructor(
    private readonly repository: CatalogAdminRepository,
    private readonly storage: ObjectStorage,
  ) {}

  listProducts(input: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
    categoryId?: string;
    sort?: string;
  }) {
    const page = safePositiveInteger(input.page, 1);
    const pageSize = Math.min(safePositiveInteger(input.pageSize, 12), 50);
    const statuses: ProductStatusInput[] = ["DRAFT", "ACTIVE", "INACTIVE"];
    const sorts: ProductSort[] = ["updated-desc", "updated-asc", "name-asc", "name-desc"];
    const status = statuses.find((candidate) => candidate === input.status);
    const sort = sorts.find((candidate) => candidate === input.sort) ?? "updated-desc";
    const query: AdminProductListQuery = {
      page,
      pageSize,
      sort,
      ...(input.search?.trim() ? { search: input.search.trim().slice(0, 200) } : {}),
      ...(status ? { status } : {}),
      ...(input.categoryId && z.uuid().safeParse(input.categoryId).success
        ? { categoryId: input.categoryId }
        : {}),
    };
    return this.repository.listProducts(query);
  }

  findProduct(id: string) {
    return this.repository.findProduct(z.uuid().parse(id));
  }

  listCategories() {
    return this.repository.listCategories();
  }

  findCategory(id: string) {
    return this.repository.findCategory(z.uuid().parse(id));
  }

  async saveProduct(
    rawInput: ProductFormInput,
    uploads: ObjectUpload[],
    actorUserId: string,
  ): Promise<{ id: string }> {
    const input = productFormSchema.parse(rawInput);
    if (new Set(input.existingImages.map(({ id }) => id)).size !== input.existingImages.length) {
      throw new ValidationError("No puede repetirse una imagen existente.");
    }
    if (input.existingImages.length + uploads.length > 30) {
      throw new ValidationError("Un producto puede tener hasta 30 imágenes.");
    }
    const variants = input.variants.map((variant) => ({
      ...(variant.id ? { id: variant.id } : {}),
      sku: normalizeSku(variant.sku),
      name: variant.name,
      priceInCents: variant.price,
      promotionalPriceInCents: variant.promotionalPrice,
      costInCents: variant.cost,
      isDefault: variant.isDefault,
      isActive: variant.isActive,
      initialStock: variant.initialStock,
      minimumStock: variant.minimumStock,
    }));
    validateVariants(variants, input.status);

    const stored: Array<{ objectKey: string; url: string }> = [];
    let persisted = false;
    try {
      for (const upload of uploads) stored.push(await this.storage.store(upload));
      const command: SaveProductCommand = {
        ...(input.id ? { id: input.id } : {}),
        name: input.name,
        slug: normalizeSlug(input.slug),
        shortDescription: input.shortDescription,
        description: input.description,
        status: input.status,
        featured: input.featured,
        categoryIds: [...new Set(input.categoryIds)],
        variants,
        existingImages: input.existingImages,
        newImages: stored.map((image, index) => ({
          ...image,
          altText: input.name,
          sortOrder: input.existingImages.length + index,
        })),
        actorUserId: z.uuid().parse(actorUserId),
      };

      if (input.id) {
        const result = await this.repository.updateProduct({ ...command, id: input.id });
        persisted = true;
        await Promise.allSettled(
          result.removedObjectKeys.map((key) => this.storage.delete(key)),
        );
        return { id: result.id };
      }
      const result = await this.repository.createProduct(command);
      persisted = true;
      return result;
    } catch (error) {
      if (!persisted) {
        await Promise.allSettled(
          stored.map((image) => this.storage.delete(image.objectKey)),
        );
      }
      throw error;
    }
  }

  setProductStatus(id: string, status: "ACTIVE" | "INACTIVE", actorUserId: string) {
    return this.repository.setProductStatus(
      z.uuid().parse(id),
      status,
      z.uuid().parse(actorUserId),
    );
  }

  async saveCategory(rawInput: CategoryFormInput, actorUserId: string) {
    const input = categoryFormSchema.parse(rawInput);
    if (input.id && input.parentId === input.id) {
      throw new ValidationError("Una categoría no puede ser su propia categoría padre.");
    }
    const command: SaveCategoryCommand = {
      ...(input.id ? { id: input.id } : {}),
      parentId: input.parentId,
      name: input.name,
      slug: normalizeSlug(input.slug),
      description: input.description,
      isActive: input.isActive,
      sortOrder: input.sortOrder,
      actorUserId: z.uuid().parse(actorUserId),
    };
    return input.id
      ? this.repository.updateCategory({ ...command, id: input.id })
      : this.repository.createCategory(command);
  }

  setCategoryActive(id: string, active: boolean, actorUserId: string) {
    return this.repository.setCategoryActive(
      z.uuid().parse(id),
      active,
      z.uuid().parse(actorUserId),
    );
  }
}

function validateVariants(
  variants: SaveProductCommand["variants"],
  status: ProductStatusInput,
): void {
  const defaultVariants = variants.filter((variant) => variant.isDefault);
  if (defaultVariants.length !== 1) {
    throw new ValidationError("El producto debe tener exactamente una variante predeterminada.");
  }
  if (!defaultVariants[0]?.isActive) {
    throw new ValidationError("La variante predeterminada debe estar activa.");
  }
  if (status === "ACTIVE" && !variants.some((variant) => variant.isActive)) {
    throw new ValidationError("Un producto activo necesita una variante activa.");
  }
  const skuCount = new Set(variants.map((variant) => variant.sku)).size;
  if (skuCount !== variants.length) {
    throw new ConflictError("No puede repetirse un SKU dentro del producto.");
  }
  for (const variant of variants) {
    if (
      variant.promotionalPriceInCents !== null &&
      variant.promotionalPriceInCents >= variant.priceInCents
    ) {
      throw new ValidationError("El precio promocional debe ser menor al precio regular.");
    }
  }
}

function safePositiveInteger(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0 ? value! : fallback;
}

export function mapCatalogWriteError(error: unknown): Error {
  if (error instanceof z.ZodError) {
    return new ValidationError(error.issues[0]?.message ?? "Datos inválidos.");
  }
  if (error instanceof Error) return error;
  return new Error("No se pudo completar la operación.");
}

export function assertFound<T>(value: T | null, message: string): T {
  if (!value) throw new NotFoundError(message);
  return value;
}
