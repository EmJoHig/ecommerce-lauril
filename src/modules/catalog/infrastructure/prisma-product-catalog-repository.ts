import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { effectivePrice } from "@/shared/domain/money";
import { calculateAvailableStock } from "@/modules/inventory/domain/inventory";
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

  async listProductPage(input: ListCatalogProductsInput) {
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 12;
    const where = publicProductWhere(input);
    const total = await this.prisma.product.count({ where });
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const effectivePage = Math.min(page, pageCount);
    const rows = await this.prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: publicProductOrder(input.sort),
        skip: (effectivePage - 1) * pageSize,
        take: pageSize,
      });
    return {
      items: rows.map(mapProduct),
      total,
      page: effectivePage,
      pageSize,
      pageCount,
    };
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
      where: publicProductWhere(input),
      include: productInclude,
      orderBy: publicProductOrder(input.sort),
      take: input.limit ?? 24,
    });
  }
}

const productInclude = {
  images: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
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
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    imageUrl: image?.url ?? null,
    imageAlt: image?.altText ?? null,
    images: row.images.map(({ id, url, altText }) => ({ id, url, altText })),
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
      availableStock: calculateAvailableStock(
        variant.inventory?.stockOnHand ?? 0,
        variant.inventory?.stockReserved ?? 0,
      ),
      isDefault: variant.isDefault,
    })),
  };
}

function publicProductWhere(input: ListCatalogProductsInput): Prisma.ProductWhereInput {
  return {
    status: "ACTIVE",
    variants: { some: { isActive: true } },
    ...(input.featured === undefined ? {} : { featured: input.featured }),
    ...(input.categorySlug
      ? {
          categories: {
            some: { category: { slug: input.categorySlug, isActive: true } },
          },
        }
      : {}),
    ...(input.search
      ? {
          OR: [
            { name: { contains: input.search, mode: "insensitive" } },
            { shortDescription: { contains: input.search, mode: "insensitive" } },
            { variants: { some: { sku: { contains: input.search.toUpperCase() } } } },
          ],
        }
      : {}),
  };
}

function publicProductOrder(
  sort: ListCatalogProductsInput["sort"],
): Prisma.ProductOrderByWithRelationInput[] {
  if (sort === "name-asc") return [{ name: "asc" }];
  if (sort === "name-desc") return [{ name: "desc" }];
  if (sort === "newest") return [{ publishedAt: "desc" }, { name: "asc" }];
  return [{ featured: "desc" }, { publishedAt: "desc" }, { name: "asc" }];
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
