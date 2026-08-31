import { ValidationError } from "@/shared/domain/errors";
import { effectivePrice } from "@/shared/domain/money";

export type CatalogVariant = Readonly<{
  id: string;
  sku: string;
  name: string;
  attributes: Readonly<Record<string, string>>;
  priceInCents: bigint;
  promotionalPriceInCents: bigint | null;
  currentPriceInCents: bigint;
  availableStock: number;
  isDefault: boolean;
}>;

export type CatalogProduct = Readonly<{
  id: string;
  name: string;
  slug: string;
  shortDescription: string | null;
  description: string | null;
  featured: boolean;
  imageUrl: string | null;
  imageAlt: string | null;
  categories: ReadonlyArray<{ name: string; slug: string }>;
  variants: ReadonlyArray<CatalogVariant>;
}>;

export function normalizeSlug(value: string): string {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180)
    .replace(/-+$/g, "");

  if (!slug) {
    throw new ValidationError("No se pudo generar un slug válido.");
  }

  return slug;
}

export function getLowestProductPrice(product: CatalogProduct): bigint {
  const prices = product.variants.map((variant) =>
    effectivePrice(variant.priceInCents, variant.promotionalPriceInCents),
  );

  if (prices.length === 0) {
    throw new ValidationError("El producto no tiene variantes vendibles.");
  }

  return prices.reduce((lowest, price) => (price < lowest ? price : lowest));
}
