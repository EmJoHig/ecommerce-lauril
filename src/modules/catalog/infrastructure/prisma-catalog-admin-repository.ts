import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { ConflictError, NotFoundError, ValidationError } from "@/shared/domain/errors";
import { calculateAvailableStock } from "@/modules/inventory/domain/inventory";
import type {
  AdminCategory,
  AdminProductEditor,
  AdminProductListQuery,
  CatalogAdminRepository,
  SaveCategoryCommand,
  SaveProductCommand,
} from "../application/catalog-admin-repository";

export class PrismaCatalogAdminRepository implements CatalogAdminRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listProducts(query: AdminProductListQuery) {
    const where: Prisma.ProductWhereInput = {
      status: query.status ?? { not: "ARCHIVED" },
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { variants: { some: { sku: { contains: query.search.toUpperCase() } } } },
            ],
          }
        : {}),
      ...(query.categoryId
        ? { categories: { some: { categoryId: query.categoryId } } }
        : {}),
    };
    const orderBy: Prisma.ProductOrderByWithRelationInput[] =
      query.sort === "updated-asc"
        ? [{ updatedAt: "asc" }, { id: "asc" }]
        : query.sort === "name-asc"
          ? [{ name: "asc" }, { id: "asc" }]
          : query.sort === "name-desc"
            ? [{ name: "desc" }, { id: "asc" }]
            : [{ updatedAt: "desc" }, { id: "asc" }];
    const total = await this.prisma.product.count({ where });
    const pageCount = Math.max(1, Math.ceil(total / query.pageSize));
    const effectivePage = Math.min(query.page, pageCount);
    const products = await this.prisma.product.findMany({
        where,
        orderBy,
        skip: (effectivePage - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          images: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], take: 1 },
          categories: { orderBy: { sortOrder: "asc" }, include: { category: true } },
          variants: {
            orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }],
            include: { inventory: true },
          },
        },
      });

    return {
      items: products.map((product) => {
        const primary = product.variants[0];
        return {
          id: product.id,
          name: product.name,
          slug: product.slug,
          status: product.status,
          imageUrl: product.images[0]?.url ?? null,
          imageAlt: product.images[0]?.altText ?? null,
          primarySku: primary?.sku ?? "—",
          categoryNames: product.categories.map(({ category }) => category.name),
          priceInCents: primary?.priceInCents ?? 0n,
          availableStock: product.variants.reduce(
            (totalStock, variant) =>
              totalStock +
              calculateAvailableStock(
                variant.inventory?.stockOnHand ?? 0,
                variant.inventory?.stockReserved ?? 0,
              ),
            0,
          ),
          updatedAt: product.updatedAt,
        };
      }),
      total,
      page: effectivePage,
      pageSize: query.pageSize,
      pageCount,
    };
  }

  async findProduct(id: string): Promise<AdminProductEditor | null> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        categories: true,
        images: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        variants: {
          orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }],
          include: { inventory: true },
        },
      },
    });
    if (!product) return null;

    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      shortDescription: product.shortDescription,
      description: product.description,
      status: product.status,
      featured: product.featured,
      categoryIds: product.categories.map(({ categoryId }) => categoryId),
      images: product.images,
      variants: product.variants.map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        name: variant.name,
        priceInCents: variant.priceInCents,
        promotionalPriceInCents: variant.promotionalPriceInCents,
        costInCents: variant.costInCents,
        isDefault: variant.isDefault,
        isActive: variant.isActive,
        stockOnHand: variant.inventory?.stockOnHand ?? 0,
        stockReserved: variant.inventory?.stockReserved ?? 0,
        minimumStock: variant.inventory?.minimumStock ?? 0,
      })),
    };
  }

  async createProduct(command: SaveProductCommand): Promise<{ id: string }> {
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const product = await transaction.product.create({
            data: {
              name: command.name,
              slug: command.slug,
              shortDescription: command.shortDescription,
              description: command.description,
              status: command.status,
              featured: command.featured,
              publishedAt: command.status === "ACTIVE" ? new Date() : null,
            },
          });
          if (command.categoryIds.length > 0) {
            await transaction.productCategory.createMany({
              data: command.categoryIds.map((categoryId, sortOrder) => ({
                productId: product.id,
                categoryId,
                sortOrder,
              })),
            });
          }
          for (const [sortOrder, variant] of command.variants.entries()) {
            const savedVariant = await transaction.productVariant.create({
              data: {
                productId: product.id,
                sku: variant.sku,
                name: variant.name,
                priceInCents: variant.priceInCents,
                promotionalPriceInCents: variant.promotionalPriceInCents,
                costInCents: variant.costInCents,
                isDefault: variant.isDefault,
                isActive: variant.isActive,
                sortOrder,
              },
            });
            await createInventoryWithInitialMovement(transaction, {
              variantId: savedVariant.id,
              stock: variant.initialStock,
              minimumStock: variant.minimumStock,
              sku: variant.sku,
              actorUserId: command.actorUserId,
            });
          }
          if (command.newImages.length > 0) {
            await transaction.productImage.createMany({
              data: command.newImages.map((image) => ({ ...image, productId: product.id })),
            });
          }
          await transaction.auditLog.create({
            data: {
              actorUserId: command.actorUserId,
              action: "catalog.product.create",
              entityType: "Product",
              entityId: product.id,
              metadata: { slug: product.slug },
            },
          });
          return { id: product.id };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }

  async updateProduct(command: SaveProductCommand & { id: string }) {
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const current = await transaction.product.findUnique({
            where: { id: command.id },
            include: { variants: true, images: true },
          });
          if (!current || current.status === "ARCHIVED") {
            throw new NotFoundError("No se encontró un producto editable.");
          }
          assertSameIds(
            current.variants.map(({ id }) => id),
            command.variants.flatMap((variant) => (variant.id ? [variant.id] : [])),
            "variantes",
          );
          const suppliedImageIds = command.existingImages.map(({ id }) => id);
          if (suppliedImageIds.some((id) => !current.images.some((image) => image.id === id))) {
            throw new ValidationError("Se recibió una imagen que no pertenece al producto.");
          }

          await transaction.product.update({
            where: { id: command.id },
            data: {
              name: command.name,
              slug: command.slug,
              shortDescription: command.shortDescription,
              description: command.description,
              status: command.status,
              featured: command.featured,
              ...(command.status === "ACTIVE" && !current.publishedAt
                ? { publishedAt: new Date() }
                : {}),
            },
          });
          await transaction.productCategory.deleteMany({ where: { productId: command.id } });
          if (command.categoryIds.length > 0) {
            await transaction.productCategory.createMany({
              data: command.categoryIds.map((categoryId, sortOrder) => ({
                productId: command.id,
                categoryId,
                sortOrder,
              })),
            });
          }

          await transaction.productVariant.updateMany({
            where: { productId: command.id },
            data: { isDefault: false },
          });
          for (const variant of command.variants.filter((item) => item.id)) {
            const variantId = variant.id;
            if (!variantId) continue;
            await transaction.productVariant.update({
              where: { id: variantId },
              data: { sku: `TMP-${randomUUID().toUpperCase()}` },
            });
          }
          for (const [sortOrder, variant] of command.variants.entries()) {
            if (variant.id) {
              await transaction.productVariant.update({
                where: { id: variant.id },
                data: {
                  sku: variant.sku,
                  name: variant.name,
                  priceInCents: variant.priceInCents,
                  promotionalPriceInCents: variant.promotionalPriceInCents,
                  costInCents: variant.costInCents,
                  isDefault: variant.isDefault,
                  isActive: variant.isActive,
                  sortOrder,
                  inventory: { update: { minimumStock: variant.minimumStock } },
                },
              });
            } else {
              const savedVariant = await transaction.productVariant.create({
                data: {
                  productId: command.id,
                  sku: variant.sku,
                  name: variant.name,
                  priceInCents: variant.priceInCents,
                  promotionalPriceInCents: variant.promotionalPriceInCents,
                  costInCents: variant.costInCents,
                  isDefault: variant.isDefault,
                  isActive: variant.isActive,
                  sortOrder,
                },
              });
              await createInventoryWithInitialMovement(transaction, {
                variantId: savedVariant.id,
                stock: variant.initialStock,
                minimumStock: variant.minimumStock,
                sku: variant.sku,
                actorUserId: command.actorUserId,
              });
            }
          }

          const removedImages = current.images.filter(
            (image) => !suppliedImageIds.includes(image.id),
          );
          if (removedImages.length > 0) {
            await transaction.productImage.deleteMany({
              where: { id: { in: removedImages.map(({ id }) => id) } },
            });
          }
          for (const image of command.existingImages) {
            await transaction.productImage.update({
              where: { id: image.id },
              data: { altText: image.altText, sortOrder: image.sortOrder },
            });
          }
          if (command.newImages.length > 0) {
            await transaction.productImage.createMany({
              data: command.newImages.map((image) => ({ ...image, productId: command.id })),
            });
          }
          await transaction.auditLog.create({
            data: {
              actorUserId: command.actorUserId,
              action: "catalog.product.update",
              entityType: "Product",
              entityId: command.id,
              metadata: { slug: command.slug },
            },
          });
          return {
            id: command.id,
            removedObjectKeys: removedImages.map(({ objectKey }) => objectKey),
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }

  async setProductStatus(
    id: string,
    status: "ACTIVE" | "INACTIVE",
    actorUserId: string,
  ): Promise<void> {
    try {
      await this.prisma.$transaction(
        async (transaction) => {
          const product = await transaction.product.findUnique({
            where: { id },
            include: { variants: true },
          });
          if (!product || product.status === "ARCHIVED") {
            throw new NotFoundError("Producto inexistente.");
          }
          if (
            status === "ACTIVE" &&
            !product.variants.some((variant) => variant.isDefault && variant.isActive)
          ) {
            throw new ValidationError("No se puede activar sin una variante predeterminada activa.");
          }
          await transaction.product.update({
            where: { id },
            data: {
              status,
              ...(status === "ACTIVE" && !product.publishedAt
                ? { publishedAt: new Date() }
                : {}),
            },
          });
          await transaction.auditLog.create({
            data: {
              actorUserId,
              action:
                status === "ACTIVE"
                  ? "catalog.product.activate"
                  : "catalog.product.deactivate",
              entityType: "Product",
              entityId: id,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }

  async listCategories(): Promise<AdminCategory[]> {
    const categories = await this.prisma.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { products: true } } },
    });
    return categories.map(mapCategory);
  }

  async findCategory(id: string): Promise<AdminCategory | null> {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
    return category ? mapCategory(category) : null;
  }

  async createCategory(command: SaveCategoryCommand): Promise<{ id: string }> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        await assertParentExists(transaction, command.parentId);
        const category = await transaction.category.create({ data: categoryData(command) });
        await transaction.auditLog.create({
          data: {
            actorUserId: command.actorUserId,
            action: "catalog.category.create",
            entityType: "Category",
            entityId: category.id,
            metadata: { slug: category.slug },
          },
        });
        return { id: category.id };
      });
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }

  async updateCategory(command: SaveCategoryCommand & { id: string }): Promise<{ id: string }> {
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          await transaction.$executeRaw`SELECT pg_advisory_xact_lock(741852963)`;
          const current = await transaction.category.findUnique({ where: { id: command.id } });
          if (!current) throw new NotFoundError("Categoría inexistente.");
          await assertParentExists(transaction, command.parentId);
          if (command.parentId) {
            const cycle = await transaction.$queryRaw<Array<{ cycle: boolean }>>`
              WITH RECURSIVE ancestors AS (
                SELECT id, parent_id FROM categories WHERE id = ${command.parentId}::uuid
                UNION ALL
                SELECT category.id, category.parent_id
                FROM categories category
                JOIN ancestors ON category.id = ancestors.parent_id
              )
              SELECT EXISTS(SELECT 1 FROM ancestors WHERE id = ${command.id}::uuid) AS cycle
            `;
            if (cycle[0]?.cycle) {
              throw new ConflictError("La categoría padre generaría un ciclo en la jerarquía.");
            }
          }
          await transaction.category.update({
            where: { id: command.id },
            data: categoryData(command),
          });
          await transaction.auditLog.create({
            data: {
              actorUserId: command.actorUserId,
              action: "catalog.category.update",
              entityType: "Category",
              entityId: command.id,
              metadata: { slug: command.slug },
            },
          });
          return { id: command.id };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }

  async setCategoryActive(id: string, isActive: boolean, actorUserId: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (transaction) => {
        const result = await transaction.category.updateMany({ where: { id }, data: { isActive } });
        if (result.count !== 1) throw new NotFoundError("Categoría inexistente.");
        await transaction.auditLog.create({
          data: {
            actorUserId,
            action: isActive ? "catalog.category.activate" : "catalog.category.deactivate",
            entityType: "Category",
            entityId: id,
          },
        });
      });
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }
}

type Transaction = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

async function createInventoryWithInitialMovement(
  transaction: Transaction,
  input: { variantId: string; stock: number; minimumStock: number; sku: string; actorUserId: string },
): Promise<void> {
  const inventory = await transaction.inventory.create({
    data: {
      variantId: input.variantId,
      stockOnHand: input.stock,
      stockReserved: 0,
      minimumStock: input.minimumStock,
      version: input.stock > 0 ? 1 : 0,
    },
  });
  if (input.stock > 0) {
    await transaction.inventoryMovement.create({
      data: {
        inventoryId: inventory.id,
        type: "RECEIPT",
        quantity: input.stock,
        stockBefore: 0,
        stockAfter: input.stock,
        reason: "Stock inicial al crear la variante",
        referenceType: "catalog_variant_create",
        referenceId: input.sku,
        adminUserId: input.actorUserId,
      },
    });
  }
}

async function assertParentExists(transaction: Transaction, parentId: string | null): Promise<void> {
  if (!parentId) return;
  const parent = await transaction.category.findUnique({ where: { id: parentId }, select: { id: true } });
  if (!parent) throw new ValidationError("La categoría padre seleccionada no existe.");
}

function categoryData(command: SaveCategoryCommand) {
  return {
    parentId: command.parentId,
    name: command.name,
    slug: command.slug,
    description: command.description,
    isActive: command.isActive,
    sortOrder: command.sortOrder,
  };
}

function mapCategory(category: {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  updatedAt: Date;
  _count: { products: number };
}): AdminCategory {
  return { ...category, productCount: category._count.products };
}

function assertSameIds(expected: string[], received: string[], label: string): void {
  const left = [...expected].sort();
  const right = [...received].sort();
  if (left.length !== right.length || left.some((id, index) => id !== right[index])) {
    throw new ConflictError(`La lista de ${label} cambió; recargá el formulario.`);
  }
}

function mapPersistenceError(error: unknown): Error {
  if (error instanceof Error && "code" in error && error.code === "P2034") {
    return new ConflictError(
      "El catálogo cambió al mismo tiempo; recargá la página y volvé a intentar.",
    );
  }
  if (error instanceof Error && "code" in error && error.code === "P2002") {
    const target = String((error as { meta?: { target?: unknown } }).meta?.target ?? "");
    if (target.includes("slug")) return new ConflictError("El slug ya está en uso.");
    if (target.includes("sku")) return new ConflictError("El SKU ya está en uso.");
    return new ConflictError("Ya existe un registro con esos datos únicos.");
  }
  return error instanceof Error ? error : new Error("Error de persistencia desconocido.");
}
