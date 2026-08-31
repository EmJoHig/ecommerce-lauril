import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { effectivePrice } from "@/shared/domain/money";
import type {
  CatalogCategory,
  ListCatalogProductsInput,
  ProductCatalogRepository,
} from "../application/product-catalog-repository";
import type { CatalogProduct } from "../domain/product";

type ProductRow = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

export class PrismaProductCatalogRepository
  implements ProductCatalogRepository
{
  constructor(private readonly prisma: PrismaClient) {}

  async listProducts(
    input: ListCatalogProductsInput = {},
  ): Promise<CatalogProduct[]> {
    const rows = await this.queryProducts(input);
    return rows.map(mapProduct);
  }

  async findBySlug(slug: string): Promise<CatalogProduct | null> {
    const row = await this.prisma.product.findFirst({
      where: {
        slug,
        status: "ACTIVE",
        variants: { some: { isActive: true } },
      },
      include: productInclude,
    });

    return row ? mapProduct(row) : null;
  }

  async listCategories(): Promise<CatalogCategory[]> {
    return this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true, description: true },
    });
  }

  queryProducts(input: ListCatalogProductsInput = {}) {
    return this.prisma.product.findMany({
      where: {
        status: "ACTIVE",
        variants: { some: { isActive: true } },
        ...(input.featured === undefined ? {} : { featured: input.featured }),
        ...(input.categorySlug
          ? { categories: { some: { category: { slug: input.categorySlug } } } }
          : {}),
      },
      include: productInclude,
      orderBy: [{ featured: "desc" }, { publishedAt: "desc" }, { name: "asc" }],
      take: input.limit ?? 24,
    });
  }
}

const productInclude = {
  images: { orderBy: { sortOrder: "asc" }, take: 1 },
  categories: {
    orderBy: { sortOrder: "asc" },
    include: { category: { select: { name: true, slug: true } } },
  },
  variants: {
    where: { isActive: true },
    orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }],
    include: { inventory: true },
  },
} satisfies Prisma.ProductInclude;

function mapProduct(row: ProductRow): CatalogProduct {
  const image = row.images[0] ?? null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    shortDescription: row.shortDescription,
    description: row.description,
    featured: row.featured,
    imageUrl: image?.url ?? null,
    imageAlt: image?.altText ?? null,
    categories: row.categories.map(({ category }) => category),
    variants: row.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      name: variant.name,
      attributes: toStringRecord(variant.attributes),
      priceInCents: variant.priceInCents,
      promotionalPriceInCents: variant.promotionalPriceInCents,
      currentPriceInCents: effectivePrice(
        variant.priceInCents,
        variant.promotionalPriceInCents,
      ),
      availableStock: Math.max(
        0,
        (variant.inventory?.stockOnHand ?? 0) -
          (variant.inventory?.stockReserved ?? 0),
      ),
      isDefault: variant.isDefault,
    })),
  };
}

function toStringRecord(value: unknown): Readonly<Record<string, string>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] =>
      typeof entry[1] === "string",
    ),
  );
}
