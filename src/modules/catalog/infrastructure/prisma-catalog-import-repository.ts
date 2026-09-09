import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { calculateStockTransition } from "@/modules/inventory/domain/inventory";
import { ConflictError, ValidationError } from "@/shared/domain/errors";
import type {
  CatalogImportRepository,
  CatalogImportResult,
  CatalogImportRow,
} from "../application/catalog-import";
import { COMMERCIAL_CATEGORIES } from "../application/catalog-import";
import { normalizeSlug } from "../domain/product";

type Transaction = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export class PrismaCatalogImportRepository implements CatalogImportRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async importProducts(rows: CatalogImportRow[], actorUserId: string): Promise<CatalogImportResult> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        await transaction.sequence.upsert({
          where: { id: "lock:catalog-import" },
          update: { value: { increment: 1n } },
          create: { id: "lock:catalog-import", value: 1n },
        });
        const categoryIds = await synchronizeCategories(transaction);
        const existingVariants = await transaction.productVariant.findMany({
          where: { sku: { in: rows.map(({ sku }) => sku) } },
          include: { inventory: true, product: true },
        });
        const repeatedProduct = existingVariants.find((variant, index) =>
          existingVariants.some((candidate, candidateIndex) => candidateIndex < index && candidate.productId === variant.productId),
        );
        if (repeatedProduct) {
          throw new ConflictError("El Excel contiene más de un SKU de un mismo producto existente; no se importó ninguna fila.");
        }
        const variantsBySku = new Map(existingVariants.map((variant) => [variant.sku, variant]));
        let created = 0;
        let updated = 0;

        for (const row of rows) {
          const currentVariant = variantsBySku.get(row.sku);
          if (currentVariant?.product.status === "ARCHIVED") {
            throw new ConflictError(`Fila ${row.rowNumber}: el SKU ${row.sku} pertenece a un producto archivado.`);
          }

          const productId = currentVariant?.productId ?? (await createImportedProduct(transaction, row)).id;
          const slug = currentVariant?.product.slug ?? await availableSlug(transaction, row.slug, row.sku);
          if (currentVariant) {
            await transaction.product.update({
              where: { id: productId },
              data: {
                name: row.name,
                slug,
                description: row.description,
                shortDescription: null,
                status: row.showInStore ? "ACTIVE" : "INACTIVE",
                featured: false,
                ...(row.showInStore && !currentVariant.product.publishedAt ? { publishedAt: new Date() } : {}),
              },
            });
            await transaction.productVariant.updateMany({
              where: { productId, id: { not: currentVariant.id } },
              data: { isDefault: false, isActive: false },
            });
            await transaction.productVariant.update({
              where: { id: currentVariant.id },
              data: variantData(row),
            });
            await setImportedStock(transaction, {
              inventoryId: currentVariant.inventory?.id,
              variantId: currentVariant.id,
              currentStock: currentVariant.inventory?.stockOnHand ?? 0,
              reservedStock: currentVariant.inventory?.stockReserved ?? 0,
              desiredStock: row.stock,
              sku: row.sku,
              actorUserId,
            });
            updated += 1;
          } else {
            const variant = await transaction.productVariant.create({
              data: { productId, sku: row.sku, ...variantData(row) },
              select: { id: true },
            });
            await setImportedStock(transaction, {
              variantId: variant.id,
              currentStock: 0,
              reservedStock: 0,
              desiredStock: row.stock,
              sku: row.sku,
              actorUserId,
            });
            created += 1;
          }

          await transaction.productCategory.deleteMany({ where: { productId } });
          await transaction.productCategory.create({
            data: { productId, categoryId: requiredCategoryId(categoryIds, row.categorySlug) },
          });
          await transaction.auditLog.create({
            data: {
              actorUserId,
              action: currentVariant ? "catalog.product.import_update" : "catalog.product.import_create",
              entityType: "Product",
              entityId: productId,
              metadata: { sku: row.sku, sourceRow: row.rowNumber },
            },
          });
        }

        return {
          created,
          updated,
          products: rows.length,
          categories: new Set(rows.map((row) => row.categorySlug)).size,
          fragrances: new Set(rows.map((row) => row.fragranceKey)).size,
        };
      });
    } catch (error) {
      throw mapImportPersistenceError(error);
    }
  }
}

async function synchronizeCategories(transaction: Transaction): Promise<Map<string, string>> {
  const categoryIds = new Map<string, string>();
  for (const [sortOrder, category] of COMMERCIAL_CATEGORIES.entries()) {
    const saved = await transaction.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name, isActive: true, parentId: null, sortOrder: sortOrder + 1 },
      create: { name: category.name, slug: category.slug, isActive: true, sortOrder: sortOrder + 1 },
      select: { id: true },
    });
    categoryIds.set(category.slug, saved.id);
  }
  await transaction.category.updateMany({
    where: { slug: { notIn: COMMERCIAL_CATEGORIES.map(({ slug }) => slug) } },
    data: { isActive: false },
  });
  return categoryIds;
}

async function createImportedProduct(transaction: Transaction, row: CatalogImportRow) {
  const slug = await availableSlug(transaction, row.slug, row.sku);
  return transaction.product.create({
    data: {
      name: row.name,
      slug,
      description: row.description,
      status: row.showInStore ? "ACTIVE" : "INACTIVE",
      featured: false,
      publishedAt: row.showInStore ? new Date() : null,
    },
    select: { id: true },
  });
}

function variantData(row: CatalogImportRow) {
  return {
    name: "Única",
    attributes: { fragancia: row.fragrance, fraganciaKey: row.fragranceKey },
    fragranceKey: row.fragranceKey,
    priceInCents: row.priceInCents,
    promotionalPriceInCents: row.promotionalPriceInCents,
    costInCents: null,
    isDefault: true,
    isActive: true,
    sortOrder: 0,
  };
}

async function setImportedStock(transaction: Transaction, input: {
  inventoryId?: string | undefined;
  variantId: string;
  currentStock: number;
  reservedStock: number;
  desiredStock: number;
  sku: string;
  actorUserId: string;
}): Promise<void> {
  if (input.desiredStock < input.reservedStock) {
    throw new ConflictError(`El stock de ${input.sku} no puede quedar por debajo de sus reservas (${input.reservedStock}).`);
  }
  const inventory = input.inventoryId
    ? { id: input.inventoryId }
    : await transaction.inventory.create({
        data: { variantId: input.variantId, stockOnHand: 0, stockReserved: 0, minimumStock: 0 },
        select: { id: true },
      });
  const quantity = input.desiredStock - input.currentStock;
  if (quantity === 0) return;
  const transition = calculateStockTransition({
    stockOnHand: input.currentStock,
    stockReserved: input.reservedStock,
    quantity,
    type: "CORRECTION",
  });
  await transaction.inventory.update({
    where: { id: inventory.id },
    data: { stockOnHand: transition.stockAfter, version: { increment: 1 } },
  });
  const movement = await transaction.inventoryMovement.create({
    data: {
      inventoryId: inventory.id,
      type: "CORRECTION",
      quantity,
      stockBefore: transition.stockBefore,
      stockAfter: transition.stockAfter,
      reason: "Ajuste por importación de catálogo desde Excel",
      referenceType: "catalog_excel_import",
      referenceId: input.sku,
      adminUserId: input.actorUserId,
    },
    select: { id: true },
  });
  await transaction.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      action: "inventory.adjust",
      entityType: "Inventory",
      entityId: inventory.id,
      metadata: {
        movementId: movement.id,
        quantity,
        stockBefore: transition.stockBefore,
        stockAfter: transition.stockAfter,
      },
    },
  });
}

async function availableSlug(transaction: Transaction, baseSlug: string, sku: string): Promise<string> {
  const existing = await transaction.product.findUnique({ where: { slug: baseSlug }, select: { id: true } });
  return existing ? normalizeSlug(`${baseSlug}-${sku}`) : baseSlug;
}

function requiredCategoryId(categoryIds: Map<string, string>, slug: string): string {
  const id = categoryIds.get(slug);
  if (!id) throw new ValidationError(`No se pudo preparar la categoría ${slug}.`);
  return id;
}

function mapImportPersistenceError(error: unknown): Error {
  if (error instanceof Error && "code" in error && error.code === "P2034") {
    return new ConflictError("El catálogo cambió durante la importación; validá el archivo nuevamente.");
  }
  if (error instanceof Error && "code" in error && error.code === "P2002") {
    return new ConflictError("Un SKU o slug ya está en uso; no se importó ninguna fila.");
  }
  return error instanceof Error ? error : new Error("Error de persistencia desconocido.");
}
