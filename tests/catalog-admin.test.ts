import { describe, expect, it } from "vitest";
import { CatalogAdminService } from "@/modules/catalog/application/catalog-admin-service";
import type {
  AdminCategory,
  AdminProductEditor,
  CatalogAdminRepository,
  SaveCategoryCommand,
  SaveProductCommand,
} from "@/modules/catalog/application/catalog-admin-repository";
import type { ObjectStorage } from "@/modules/catalog/application/object-storage";
import { ConflictError, ValidationError } from "@/shared/domain/errors";

const actorId = "7bcaa109-9007-4f1c-bf56-bc4eaaf05647";
const productId = "11f105f4-4ca9-414f-89de-f58b9670ec4d";
const variantId = "2d45820e-f6ac-405d-a72c-f3ce7e3d6daf";
const categoryId = "f4205e06-95ee-4b10-995a-1f00be39e1ee";

class FakeCatalogRepository implements CatalogAdminRepository {
  productCommand: SaveProductCommand | null = null;
  categoryCommand: SaveCategoryCommand | null = null;
  createError: Error | null = null;
  categoryUpdateError: Error | null = null;
  listProducts() { return Promise.resolve({ items: [], total: 0, page: 1, pageSize: 12, pageCount: 1 }); }
  findProduct(): Promise<AdminProductEditor | null> { return Promise.resolve(null); }
  createProduct(command: SaveProductCommand) { if (this.createError) return Promise.reject(this.createError); this.productCommand = command; return Promise.resolve({ id: productId }); }
  updateProduct(command: SaveProductCommand & { id: string }) { this.productCommand = command; return Promise.resolve({ id: command.id, removedObjectKeys: [] }); }
  setProductStatus() { return Promise.resolve(); }
  listCategories(): Promise<AdminCategory[]> { return Promise.resolve([]); }
  findCategory(): Promise<AdminCategory | null> { return Promise.resolve(null); }
  createCategory(command: SaveCategoryCommand) { this.categoryCommand = command; return Promise.resolve({ id: categoryId }); }
  updateCategory(command: SaveCategoryCommand & { id: string }) { if (this.categoryUpdateError) return Promise.reject(this.categoryUpdateError); this.categoryCommand = command; return Promise.resolve({ id: command.id }); }
  setCategoryActive() { return Promise.resolve(); }
}

const storage: ObjectStorage = {
  store: async () => ({ objectKey: "local/catalog/test.png", url: "/uploads/catalog/test.png" }),
  delete: async () => undefined,
};

function validProduct(overrides: Record<string, unknown> = {}) {
  return {
    name: "Perfumina Textil Chicle",
    slug: "Perfumina Textil Chicle",
    shortDescription: "Aroma textil",
    description: "Perfumina de larga duración.",
    status: "ACTIVE" as const,
    featured: false,
    categoryIds: [categoryId],
    existingImages: [],
    variants: [{ sku: "lau-per-250", name: "250 cc", price: "4100", promotionalPrice: "", cost: "2500,50", isDefault: true, isActive: true, initialStock: 8, minimumStock: 2 }],
    ...overrides,
  };
}

describe("catalog administration", () => {
  it("crea producto, normaliza identificadores y convierte dinero a centavos", async () => {
    const repository = new FakeCatalogRepository();
    const result = await new CatalogAdminService(repository, storage).saveProduct(validProduct(), [], actorId);
    expect(result.id).toBe(productId);
    expect(repository.productCommand?.slug).toBe("perfumina-textil-chicle");
    expect(repository.productCommand?.variants[0]).toMatchObject({ sku: "LAU-PER-250", priceInCents: 410000n, costInCents: 250050n, isDefault: true });
  });

  it("edita usando el mismo caso de uso y conserva IDs existentes", async () => {
    const repository = new FakeCatalogRepository();
    await new CatalogAdminService(repository, storage).saveProduct(validProduct({ id: productId, variants: [{ ...validProduct().variants[0], id: variantId, price: "4200" }] }), [], actorId);
    expect(repository.productCommand).toMatchObject({ id: productId });
    expect(repository.productCommand?.variants[0]).toMatchObject({ id: variantId, priceInCents: 420000n });
  });

  it("rechaza SKU repetido y ausencia de variante predeterminada", async () => {
    const service = new CatalogAdminService(new FakeCatalogRepository(), storage);
    const first = validProduct().variants[0]!;
    await expect(service.saveProduct(validProduct({ variants: [first, { ...first, name: "500 cc", isDefault: false }] }), [], actorId)).rejects.toBeInstanceOf(ConflictError);
    await expect(service.saveProduct(validProduct({ variants: [{ ...first, isDefault: false }] }), [], actorId)).rejects.toBeInstanceOf(ValidationError);
  });

  it("propaga conflictos de slug y elimina objetos recién almacenados al fallar", async () => {
    const repository = new FakeCatalogRepository(); repository.createError = new ConflictError("El slug ya está en uso."); let deleted = false;
    const objectStorage: ObjectStorage = { store: async () => ({ objectKey: "local/catalog/new.png", url: "/uploads/catalog/new.png" }), delete: async () => { deleted = true; } };
    await expect(new CatalogAdminService(repository, objectStorage).saveProduct(validProduct(), [{ bytes: new Uint8Array([1]), fileName: "test.png", contentType: "image/png" }], actorId)).rejects.toThrow("El slug ya está en uso");
    expect(deleted).toBe(true);
  });

  it("valida categoría propia y propaga la prevención transaccional de ciclos profundos", async () => {
    const repository = new FakeCatalogRepository(); const service = new CatalogAdminService(repository, storage);
    const category = { id: categoryId, parentId: null, name: "Hogar editado", slug: "Hogar Editado", description: "", isActive: true, sortOrder: 1 };
    await expect(service.saveCategory(category, actorId)).resolves.toEqual({ id: categoryId });
    expect(repository.categoryCommand).toMatchObject({ id: categoryId, slug: "hogar-editado", name: "Hogar editado" });
    await expect(service.saveCategory({ ...category, parentId: categoryId }, actorId)).rejects.toBeInstanceOf(ValidationError);
    repository.categoryUpdateError = new ConflictError("La categoría padre generaría un ciclo en la jerarquía.");
    await expect(service.saveCategory({ ...category, parentId: "0f7e2701-34e7-494c-9823-30efe1f79e39" }, actorId)).rejects.toBeInstanceOf(ConflictError);
  });
});
