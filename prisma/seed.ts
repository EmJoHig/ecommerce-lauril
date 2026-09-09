import "dotenv/config";

import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/modules/auth/domain/password";
import { RecordInventoryMovement } from "../src/modules/inventory/application/record-inventory-movement";
import { PrismaInventoryUnitOfWork } from "../src/modules/inventory/infrastructure/prisma-inventory-unit-of-work";

const mongodbUri = process.env.MONGODB_URI;
if (!mongodbUri) {
  throw new Error("MONGODB_URI es obligatoria para ejecutar el seed.");
}

const prisma = new PrismaClient();

const permissions = [
  ["admin.access", "Acceder al panel"],
  ["catalog.read", "Consultar catálogo"],
  ["catalog.write", "Gestionar catálogo"],
  ["inventory.read", "Consultar inventario"],
  ["inventory.write", "Gestionar inventario"],
  ["shipping.read", "Consultar métodos de entrega"],
  ["shipping.write", "Gestionar métodos de entrega"],
  ["orders.read", "Consultar pedidos"],
  ["orders.write", "Gestionar pedidos"],
  ["customers.read", "Consultar clientes"],
  ["customers.write", "Gestionar clientes"],
  ["users.read", "Consultar administradores"],
  ["users.write", "Gestionar administradores"],
  ["roles.read", "Consultar roles y permisos"],
  ["audit.read", "Consultar auditoría"],
] as const;

const shippingMethods = [
  { code: "RETIRO_LOCAL", name: "Retiro en local", description: "Retirá tu compra sin costo cuando esté preparada.", type: "PICKUP" as const, costInCents: 0n, requiresAddress: false, minimumSubtotalInCents: null, freeShippingFromInCents: null, isActive: true, sortOrder: 1 },
  { code: "ENVIO_FIJO", name: "Envío a domicilio", description: "Tarifa fija para entregas nacionales.", type: "FLAT_RATE" as const, costInCents: 450000n, requiresAddress: true, minimumSubtotalInCents: null, freeShippingFromInCents: 8000000n, isActive: true, sortOrder: 2 },
  { code: "ENTREGA_LOCAL", name: "Entrega local", description: "Entrega coordinada dentro de la zona local.", type: "LOCAL_DELIVERY" as const, costInCents: 300000n, requiresAddress: true, minimumSubtotalInCents: null, freeShippingFromInCents: 6000000n, isActive: true, sortOrder: 3 },
  { code: "A_COORDINAR", name: "Envío a coordinar", description: "Coordinaremos la entrega después de confirmar el pago.", type: "TO_COORDINATE" as const, costInCents: 0n, requiresAddress: false, minimumSubtotalInCents: null, freeShippingFromInCents: null, isActive: true, sortOrder: 4 },
] as const;

const categories = [
  {
    slug: "perfuminas",
    name: "Perfuminas",
    description: "Aromas textiles para renovar cada ambiente.",
    sortOrder: 1,
  },
  {
    slug: "desodorantes-para-piso-concentrado",
    name: "Desodorantes para piso concentrado",
    description: "Fragancias concentradas para la limpieza de pisos.",
    sortOrder: 2,
  },
  {
    slug: "difusores",
    name: "Difusores",
    description: "Difusores para perfumar los espacios de forma continua.",
    sortOrder: 3,
  },
] as const;

const products = [
  ["BAT-017", "Uva", 100],
  ["BAT-016", "Papaya", 100],
  ["BAT-015", "Millon", 99],
  ["BAT-014", "Naranja", 100],
  ["BAT-013", "Melón Banana", 100],
  ["BAT-012", "Limón", 100],
  ["BAT-011", "Lavanda", 100],
  ["BAT-010", "Frutos Rojos", 0],
  ["BAT-009", "Flores Amarillas", 100],
  ["BAT-008", "Duvet", 0],
  ["BAT-007", "Cony", 100],
  ["BAT-006", "Coco Vai", 100],
  ["BAT-005", "Citrus", 100],
  ["BAT-004", "Chicle", 100],
  ["BAT-003", "Caricias De Algodón", 100],
  ["BAT-002", "Bouquet", 100],
  ["BAT-001", "Bebé", 100],
].map(([sku, fragrance, initialStock]) => ({
  slug: `bruma-aromatica-textil-${String(fragrance).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  name: `BRUMA AROMATICA TEXTIL ${String(fragrance).toLocaleUpperCase("es-AR")}`,
  shortDescription: null,
  description: null,
  categorySlug: "perfuminas",
  featured: false,
  sku: String(sku),
  variantName: "Única",
  attributes: {
    fragancia: String(fragrance),
    fraganciaKey: String(fragrance).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-AR"),
  },
  priceInCents: 450000n,
  promotionalPriceInCents: null,
  initialStock: Number(initialStock),
  minimumStock: 0,
}));

async function seedAuthorization(): Promise<string | null> {
  const createdPermissions = new Map<string, string>();
  for (const [code, name] of permissions) {
    const permission = await prisma.permission.upsert({
      where: { code },
      update: { name },
      create: { code, name },
    });
    createdPermissions.set(code, permission.id);
  }

  const adminRole = await prisma.role.upsert({
    where: { code: "ADMIN" },
    update: { name: "Administrador" },
    create: {
      code: "ADMIN",
      name: "Administrador",
      description: "Acceso total a la administración de la tienda.",
    },
  });

  for (const permissionId of createdPermissions.values()) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: adminRole.id, permissionId },
      },
      update: {},
      create: { roleId: adminRole.id, permissionId },
    });
  }

  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email && !password) {
    return null;
  }
  if (!email || !password) {
    throw new Error(
      "SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD deben definirse juntos.",
    );
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  const user =
    existingUser ??
    (await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(
          password,
          Number(process.env.BCRYPT_COST ?? 12),
        ),
        firstName: "Administrador",
        lastName: "Lauril",
        status: "ACTIVE",
      },
    }));
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: adminRole.id } },
    update: {},
    create: { userId: user.id, roleId: adminRole.id },
  });

  return user.id;
}

async function seedCatalog(adminUserId: string | null): Promise<void> {
  const categoryIds = new Map<string, string>();
  for (const category of categories) {
    const saved = await prisma.category.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        description: category.description,
        isActive: true,
        sortOrder: category.sortOrder,
      },
      create: { ...category, isActive: true },
    });
    categoryIds.set(category.slug, saved.id);
  }
  await prisma.category.updateMany({
    where: { slug: { notIn: categories.map(({ slug }) => slug) } },
    data: { isActive: false },
  });
  await prisma.product.updateMany({
    where: { slug: { in: ["mate-calden", "jarra-tierra", "cuenco-origen", "cepillo-lino"] } },
    data: { status: "INACTIVE" },
  });

  const movements = new RecordInventoryMovement(
    new PrismaInventoryUnitOfWork(prisma),
  );
  for (const item of products) {
    const product = await prisma.product.upsert({
      where: { slug: item.slug },
      update: {
        name: item.name,
        shortDescription: item.shortDescription,
        description: item.description,
        featured: item.featured,
        status: "ACTIVE",
      },
      create: {
        slug: item.slug,
        name: item.name,
        shortDescription: item.shortDescription,
        description: item.description,
        featured: item.featured,
        status: "ACTIVE",
        publishedAt: new Date(),
      },
    });

    const categoryId = categoryIds.get(item.categorySlug);
    if (!categoryId) throw new Error(`Categoría no encontrada: ${item.categorySlug}`);
    await prisma.productCategory.deleteMany({ where: { productId: product.id } });
    await prisma.productCategory.upsert({
      where: { productId_categoryId: { productId: product.id, categoryId } },
      update: {},
      create: { productId: product.id, categoryId },
    });
    await prisma.productImage.upsert({
      where: {
        productId_objectKey: {
          productId: product.id,
          objectKey: `seed/${item.slug}/principal.svg`,
        },
      },
      update: { altText: item.name, url: "/product-placeholder.svg" },
      create: {
        productId: product.id,
        objectKey: `seed/${item.slug}/principal.svg`,
        url: "/product-placeholder.svg",
        altText: item.name,
      },
    });

    const variant = await prisma.productVariant.upsert({
      where: { sku: item.sku },
      update: {
        productId: product.id,
        name: item.variantName,
        attributes: item.attributes,
        fragranceKey: item.attributes.fraganciaKey,
        priceInCents: item.priceInCents,
        promotionalPriceInCents: item.promotionalPriceInCents,
        isDefault: true,
        isActive: true,
      },
      create: {
        productId: product.id,
        sku: item.sku,
        name: item.variantName,
        attributes: item.attributes,
        fragranceKey: item.attributes.fraganciaKey,
        priceInCents: item.priceInCents,
        promotionalPriceInCents: item.promotionalPriceInCents,
        isDefault: true,
        isActive: true,
      },
    });
    const inventory = await prisma.inventory.upsert({
      where: { variantId: variant.id },
      update: { minimumStock: item.minimumStock },
      create: {
        variantId: variant.id,
        stockOnHand: 0,
        stockReserved: 0,
        minimumStock: item.minimumStock,
      },
    });
    const seededMovement = await prisma.inventoryMovement.findFirst({
      where: {
        inventoryId: inventory.id,
        referenceType: "development_seed",
        referenceId: item.sku,
      },
      select: { id: true },
    });
    if (!seededMovement && inventory.stockOnHand === 0 && item.initialStock !== 0) {
      await movements.execute({
        inventoryId: inventory.id,
        type: "RECEIPT",
        quantity: item.initialStock,
        reason: "Stock inicial del seed de desarrollo",
        referenceType: "development_seed",
        referenceId: item.sku,
        adminUserId,
      });
    }
  }
}

async function seedShipping(): Promise<void> {
  for (const method of shippingMethods) {
    await prisma.shippingMethod.upsert({ where: { code: method.code }, update: {}, create: method });
  }
}

async function seedStoreSettings(): Promise<void> {
  await prisma.storeSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      storeName: "Lauril",
      publicEmail: "hola@lauril.com.ar",
      businessAddress: "Buenos Aires, Argentina",
      publicDescription: "Objetos elegidos para acompañar tus rituales cotidianos.",
    },
  });
}

async function main(): Promise<void> {
  const adminUserId = await seedAuthorization();
  await seedCatalog(adminUserId);
  await seedShipping();
  await seedStoreSettings();
  console.info(
    adminUserId
      ? "Seed completado con catálogo y administrador."
      : "Seed completado. No se creó administrador (variables SEED_ADMIN_* vacías).",
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
