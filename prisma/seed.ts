import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/modules/auth/domain/password";
import { RecordInventoryMovement } from "../src/modules/inventory/application/record-inventory-movement";
import { PrismaInventoryUnitOfWork } from "../src/modules/inventory/infrastructure/prisma-inventory-unit-of-work";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL es obligatoria para ejecutar el seed.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

const permissions = [
  ["admin.access", "Acceder al panel"],
  ["catalog.read", "Consultar catálogo"],
  ["catalog.write", "Gestionar catálogo"],
  ["inventory.read", "Consultar inventario"],
  ["inventory.write", "Gestionar inventario"],
] as const;

const categories = [
  {
    slug: "ritual-del-mate",
    name: "Ritual del mate",
    description: "Mates, bombillas y accesorios para una pausa compartida.",
    sortOrder: 1,
  },
  {
    slug: "mesa-y-hogar",
    name: "Mesa & hogar",
    description: "Texturas y formas cálidas para habitar todos los días.",
    sortOrder: 2,
  },
  {
    slug: "cuidado-personal",
    name: "Cuidado personal",
    description: "Pequeños gestos de bienestar con materiales nobles.",
    sortOrder: 3,
  },
] as const;

const products = [
  {
    slug: "mate-calden",
    name: "Mate Caldén",
    shortDescription: "Madera torneada y virola de acero para el ritual de siempre.",
    description:
      "Una pieza cálida de líneas simples, sellada para acompañarte todos los días. Cada veta hace que no haya dos iguales.",
    categorySlug: "ritual-del-mate",
    featured: true,
    sku: "LAU-MAT-CAL-001",
    variantName: "Natural",
    attributes: { material: "Madera de caldén", color: "Natural" },
    priceInCents: 3290000n,
    promotionalPriceInCents: 2990000n,
    initialStock: 14,
    minimumStock: 4,
  },
  {
    slug: "jarra-tierra",
    name: "Jarra Tierra",
    shortDescription: "Cerámica de acabado mate para agua, flores o sobremesas largas.",
    description:
      "Jarra de cerámica esmaltada por dentro y de tacto mineral por fuera. Su silueta funciona tanto en la mesa como con flores.",
    categorySlug: "mesa-y-hogar",
    featured: true,
    sku: "LAU-HOG-JAR-001",
    variantName: "Terracota",
    attributes: { material: "Cerámica", color: "Terracota" },
    priceInCents: 4150000n,
    promotionalPriceInCents: null,
    initialStock: 8,
    minimumStock: 3,
  },
  {
    slug: "cuenco-origen",
    name: "Cuenco Origen",
    shortDescription: "Un cuenco versátil de gres, modelado para el uso cotidiano.",
    description:
      "Gres de alta temperatura con esmalte satinado. Ideal para desayunos, picadas y esas cosas pequeñas que merecen su lugar.",
    categorySlug: "mesa-y-hogar",
    featured: true,
    sku: "LAU-HOG-CUE-001",
    variantName: "Arena",
    attributes: { material: "Gres", color: "Arena" },
    priceInCents: 1890000n,
    promotionalPriceInCents: null,
    initialStock: 21,
    minimumStock: 6,
  },
  {
    slug: "cepillo-lino",
    name: "Cepillo Lino",
    shortDescription: "Madera y fibras vegetales para transformar un gesto simple.",
    description:
      "Cepillo corporal de mango suave y fibras firmes. Pensado para guardarse a la vista y durar mucho tiempo.",
    categorySlug: "cuidado-personal",
    featured: true,
    sku: "LAU-CUI-CEP-001",
    variantName: "Única",
    attributes: { material: "Madera y fibras vegetales" },
    priceInCents: 2240000n,
    promotionalPriceInCents: 1990000n,
    initialStock: 3,
    minimumStock: 5,
  },
] as const;

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

  const passwordHash = await hashPassword(
    password,
    Number(process.env.BCRYPT_COST ?? 12),
  );
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, status: "ACTIVE" },
    create: {
      email,
      passwordHash,
      firstName: "Administrador",
      lastName: "Lauril",
      status: "ACTIVE",
    },
  });
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
    if (!seededMovement && inventory.stockOnHand === 0) {
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

async function main(): Promise<void> {
  const adminUserId = await seedAuthorization();
  await seedCatalog(adminUserId);
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
