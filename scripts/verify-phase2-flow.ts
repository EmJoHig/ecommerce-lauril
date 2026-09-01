import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { AuthService } from "../src/modules/auth/application/auth-service";
import { PrismaAuthRepository } from "../src/modules/auth/infrastructure/prisma-auth-repository";
import { CatalogAdminService } from "../src/modules/catalog/application/catalog-admin-service";
import type { ObjectStorage } from "../src/modules/catalog/application/object-storage";
import { PrismaCatalogAdminRepository } from "../src/modules/catalog/infrastructure/prisma-catalog-admin-repository";
import { PrismaProductCatalogRepository } from "../src/modules/catalog/infrastructure/prisma-product-catalog-repository";
import { RecordInventoryMovement } from "../src/modules/inventory/application/record-inventory-movement";
import { PrismaInventoryUnitOfWork } from "../src/modules/inventory/infrastructure/prisma-inventory-unit-of-work";
import { ConflictError } from "../src/shared/domain/errors";

const databaseUrl = requiredEnv("DATABASE_URL");
const adminEmail = requiredEnv("SEED_ADMIN_EMAIL");
const adminPassword = requiredEnv("SEED_ADMIN_PASSWORD");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const storedObjects = new Set<string>();
const storage: ObjectStorage = {
  store: async () => {
    const objectKey = `manual-flow/${crypto.randomUUID()}.png`;
    storedObjects.add(objectKey);
    return { objectKey, url: "/product-placeholder.svg" };
  },
  delete: async (objectKey) => { storedObjects.delete(objectKey); },
};

async function main(): Promise<void> {
  const auth = new AuthService(new PrismaAuthRepository(prisma));
  const session = await auth.login({ email: adminEmail, password: adminPassword, ipAddress: "127.0.0.1", userAgent: "phase2-flow", ttlDays: 1 });
  const admin = new CatalogAdminService(new PrismaCatalogAdminRepository(prisma), storage);
  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
  const category = await admin.saveCategory({ parentId: null, name: `Prueba ${suffix}`, slug: `prueba-${suffix.toLowerCase()}`, description: "Categoría de prueba integral", isActive: true, sortOrder: 9000 }, session.user.id);
  const child = await admin.saveCategory({ parentId: category.id, name: `Hija ${suffix}`, slug: `hija-${suffix.toLowerCase()}`, description: "Categoría hija", isActive: true, sortOrder: 1 }, session.user.id);
  await admin.saveCategory({ id: child.id, parentId: category.id, name: `Hija editada ${suffix}`, slug: `hija-editada-${suffix.toLowerCase()}`, description: "Categoría hija editada", isActive: true, sortOrder: 2 }, session.user.id);
  let categoryCyclePrevented = false;
  try {
    await admin.saveCategory({ id: category.id, parentId: child.id, name: `Prueba ${suffix}`, slug: `prueba-${suffix.toLowerCase()}`, description: "No debe persistir", isActive: true, sortOrder: 9000 }, session.user.id);
  } catch (error) { categoryCyclePrevented = error instanceof ConflictError; }
  if (!categoryCyclePrevented) throw new Error("La prevención de ciclos no devolvió el conflicto esperado.");

  const product = await admin.saveProduct({
    name: `Perfumina Manual ${suffix}`,
    slug: `Perfumina Manual ${suffix}`,
    shortDescription: "Producto creado por el flujo integral de FASE 2.",
    description: "Descripción inicial.",
    status: "DRAFT",
    featured: false,
    categoryIds: [category.id],
    existingImages: [],
    variants: [{ sku: `MAN-${suffix}-250`, name: "250 cc", price: "4100", promotionalPrice: "", cost: "2500", isDefault: true, isActive: true, initialStock: 10, minimumStock: 2 }],
  }, [{ bytes: new Uint8Array([137, 80, 78, 71]), fileName: "manual.png", contentType: "image/png" }], session.user.id);

  const editor = await admin.findProduct(product.id);
  if (!editor || editor.images.length !== 1 || editor.variants.length !== 1) throw new Error("El alta integral quedó incompleta.");
  const variant = editor.variants[0]!;
  await admin.saveProduct({
    id: editor.id,
    name: editor.name,
    slug: editor.slug,
    shortDescription: editor.shortDescription ?? "",
    description: "Descripción modificada.",
    status: "DRAFT",
    featured: true,
    categoryIds: editor.categoryIds,
    existingImages: editor.images.map((image) => ({ id: image.id, altText: "Perfumina textil 250 cc", sortOrder: image.sortOrder })),
    variants: [{ id: variant.id, sku: variant.sku, name: variant.name, price: "4200", promotionalPrice: "3990", cost: "2500", isDefault: true, isActive: true, initialStock: 0, minimumStock: 3 }],
  }, [], session.user.id);

  const inventory = await prisma.inventory.findUniqueOrThrow({ where: { variantId: variant.id } });
  await new RecordInventoryMovement(new PrismaInventoryUnitOfWork(prisma)).execute({ inventoryId: inventory.id, type: "ADJUSTMENT", quantity: -2, reason: "Conteo manual de FASE 2", referenceType: "phase2_manual_flow", referenceId: suffix, adminUserId: session.user.id });
  const adjusted = await prisma.inventory.findUniqueOrThrow({ where: { id: inventory.id } });
  const movement = await prisma.inventoryMovement.findFirst({ where: { inventoryId: inventory.id, referenceType: "phase2_manual_flow" } });
  if (adjusted.stockOnHand !== 8 || movement?.stockBefore !== 10 || movement.stockAfter !== 8) throw new Error("El ajuste de inventario no quedó trazado.");

  await admin.setProductStatus(product.id, "ACTIVE", session.user.id);
  const publicCatalog = new PrismaProductCatalogRepository(prisma);
  const activePage = await publicCatalog.listProductPage({ search: suffix, page: 1, pageSize: 12 });
  const publicDetail = await publicCatalog.findBySlug(editor.slug);
  if (activePage.total !== 1 || !publicDetail) throw new Error("El producto activo no apareció públicamente.");
  await admin.setProductStatus(product.id, "INACTIVE", session.user.id);
  const inactivePage = await publicCatalog.listProductPage({ search: suffix, page: 1, pageSize: 12 });
  if (inactivePage.total !== 0 || (await publicCatalog.findBySlug(editor.slug))) throw new Error("El producto inactivo continúa visible.");

  const auditCount = await prisma.auditLog.count({ where: { entityId: { in: [product.id, inventory.id, category.id] } } });
  const sessionHashPersisted = (await prisma.session.findUnique({ where: { tokenHash: (await import("../src/modules/auth/domain/session-token")).hashSessionToken(session.token) } })) !== null;
  console.info(JSON.stringify({ status: "ok", login: sessionHashPersisted, categoryCreated: true, categoryEdited: true, categoryCyclePrevented, productCreated: true, imageAdded: editor.images.length === 1, productEdited: true, stockAdjusted: adjusted.stockOnHand === 8, movementRecorded: Boolean(movement), publishedAndVisible: true, detailVisible: Boolean(publicDetail), deactivatedAndHidden: inactivePage.total === 0, auditEvents: auditCount }));
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} es obligatoria para la prueba FASE 2.`);
  return value;
}
