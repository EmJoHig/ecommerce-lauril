import { z } from "zod";
import { ConflictError, ValidationError } from "@/shared/domain/errors";
import { parseMoneyInputToCents } from "@/shared/domain/money";
import { normalizeSku, normalizeSlug } from "../domain/product";

export const COMMERCIAL_CATEGORIES = [
  { name: "Perfuminas", slug: "perfuminas" },
  {
    name: "Desodorantes para piso concentrado",
    slug: "desodorantes-para-piso-concentrado",
  },
  { name: "Difusores", slug: "difusores" },
] as const;

export type CatalogImportSource = Readonly<{
  hasFragranceColumn: boolean;
  allowLegacyFragranceInference: boolean;
  rows: ReadonlyArray<Readonly<{
    rowNumber: number;
    name: string;
    sku: string;
    category: string;
    fragrance: string;
    price: string;
    promotionalPrice: string;
    stock: string;
    showInStore: string;
    description: string;
  }>>;
  workbookErrors: ReadonlyArray<string>;
}>;

export type CatalogImportRow = Readonly<{
  rowNumber: number;
  name: string;
  slug: string;
  sku: string;
  categoryName: (typeof COMMERCIAL_CATEGORIES)[number]["name"];
  categorySlug: (typeof COMMERCIAL_CATEGORIES)[number]["slug"];
  fragrance: string;
  fragranceKey: string;
  priceInCents: bigint;
  promotionalPriceInCents: bigint | null;
  stock: number;
  showInStore: boolean;
  description: string | null;
}>;

export type CatalogImportError = Readonly<{ row: number; reason: string }>;

export type CatalogImportPreview = Readonly<{
  products: number;
  categories: string[];
  fragrances: string[];
  errors: CatalogImportError[];
  rows: CatalogImportRow[];
}>;

export type CatalogImportResult = Readonly<{
  created: number;
  updated: number;
  products: number;
  categories: number;
  fragrances: number;
}>;

export interface CatalogImportRepository {
  importProducts(rows: CatalogImportRow[], actorUserId: string): Promise<CatalogImportResult>;
}

export class CatalogImportService {
  constructor(private readonly repository: CatalogImportRepository) {}

  preview(source: CatalogImportSource): CatalogImportPreview {
    return validateCatalogImport(source);
  }

  async import(source: CatalogImportSource, actorUserId: string): Promise<CatalogImportResult> {
    const preview = validateCatalogImport(source);
    if (preview.errors.length > 0) {
      throw new ValidationError("El Excel contiene errores y no fue importado.");
    }
    return this.repository.importProducts(preview.rows, z.uuid().parse(actorUserId));
  }
}

export function validateCatalogImport(source: CatalogImportSource): CatalogImportPreview {
  const errors: CatalogImportError[] = source.workbookErrors.map((reason) => ({ row: 1, reason }));
  const rows: CatalogImportRow[] = [];
  const seenSkus = new Map<string, number>();

  for (const sourceRow of source.rows) {
    const rowErrors: string[] = [];
    const name = sourceRow.name.trim().replace(/\s+/g, " ");
    if (!name) rowErrors.push("Nombre obligatorio.");

    let sku = "";
    try {
      sku = normalizeSku(sourceRow.sku);
      const previousRow = seenSkus.get(sku);
      if (previousRow) rowErrors.push(`SKU repetido; ya aparece en la fila ${previousRow}.`);
      else seenSkus.set(sku, sourceRow.rowNumber);
    } catch (error) {
      rowErrors.push(errorMessage(error, "SKU obligatorio y válido."));
    }

    const category = mapCommercialCategory(sourceRow.category);
    if (!category) {
      rowErrors.push(
        sourceRow.category.trim()
          ? "Categoría no permitida."
          : "Categoría obligatoria.",
      );
    }

    let fragrance = sourceRow.fragrance.trim();
    if (!fragrance && source.allowLegacyFragranceInference && category && name) {
      fragrance = inferLegacyFragrance(name, category.slug) ?? "";
    }
    const normalizedFragrance = normalizeFragrance(fragrance);
    if (!normalizedFragrance) rowErrors.push("Fragancia obligatoria.");

    let priceInCents = 0n;
    try {
      if (!sourceRow.price.trim()) throw new ValidationError("Precio obligatorio.");
      priceInCents = parseMoneyInputToCents(sourceRow.price);
    } catch (error) {
      rowErrors.push(errorMessage(error, "Precio inválido."));
    }

    let promotionalPriceInCents: bigint | null = null;
    if (sourceRow.promotionalPrice.trim()) {
      try {
        promotionalPriceInCents = parseMoneyInputToCents(sourceRow.promotionalPrice);
        if (promotionalPriceInCents >= priceInCents) {
          rowErrors.push("Precio oferta debe ser menor que Precio.");
        }
      } catch (error) {
        rowErrors.push(errorMessage(error, "Precio oferta inválido."));
      }
    }

    const stock = parseStock(sourceRow.stock);
    if (stock === null) rowErrors.push("Stock debe ser un entero mayor o igual a 0.");
    const showInStore = parseShowInStore(sourceRow.showInStore);
    if (showInStore === null) rowErrors.push('Mostrar en tienda debe ser "Si" o "No".');

    if (rowErrors.length > 0 || !category || !normalizedFragrance || stock === null || showInStore === null) {
      errors.push(...rowErrors.map((reason) => ({ row: sourceRow.rowNumber, reason })));
      continue;
    }

    rows.push({
      rowNumber: sourceRow.rowNumber,
      name,
      slug: normalizeSlug(name),
      sku,
      categoryName: category.name,
      categorySlug: category.slug,
      fragrance: normalizedFragrance.name,
      fragranceKey: normalizedFragrance.key,
      priceInCents,
      promotionalPriceInCents,
      stock,
      showInStore,
      description: sourceRow.description.trim() || null,
    });
  }

  const fragranceNames = new Map<string, string>();
  for (const row of rows) {
    if (!fragranceNames.has(row.fragranceKey)) fragranceNames.set(row.fragranceKey, row.fragrance);
  }
  return {
    products: rows.length,
    categories: [...new Set(rows.map((row) => row.categoryName))],
    fragrances: [...fragranceNames.values()].sort((left, right) => left.localeCompare(right, "es")),
    errors,
    rows,
  };
}

export function normalizeFragrance(value: string): { key: string; name: string } | null {
  const compact = value.trim().replace(/\s+/g, " ");
  if (!compact) return null;
  const name = compact.toLocaleLowerCase("es-AR").replace(/(^|[\s/-])\p{L}/gu, (letter) => letter.toLocaleUpperCase("es-AR"));
  const key = normalizeLookup(name);
  return key ? { key, name } : null;
}

export function mapCommercialCategory(value: string) {
  const normalized = normalizeLookup(value);
  const aliases: Record<string, (typeof COMMERCIAL_CATEGORIES)[number]["slug"]> = {
    perfuminas: "perfuminas",
    "perfuminas textiles": "perfuminas",
    "perfumina textil": "perfuminas",
    "desodorantes para piso concentrado": "desodorantes-para-piso-concentrado",
    "desodorante para piso concentrado": "desodorantes-para-piso-concentrado",
    "desodorantes concentrados para piso": "desodorantes-para-piso-concentrado",
    "desodorantes de piso": "desodorantes-para-piso-concentrado",
    difusores: "difusores",
    difusor: "difusores",
  };
  const slug = aliases[normalized];
  return slug ? COMMERCIAL_CATEGORIES.find((category) => category.slug === slug) ?? null : null;
}

export function fragranceKey(value: string): string {
  return normalizeLookup(value);
}

function inferLegacyFragrance(name: string, categorySlug: CatalogImportRow["categorySlug"]): string | null {
  const prefixes: Record<CatalogImportRow["categorySlug"], RegExp[]> = {
    perfuminas: [
      /^BRUMA\s+AROM[AÁ]TICA\s+TEXTIL\s+/iu,
      /^PERFUMINA\s+TEXTIL\s+/iu,
      /^PERFUMINA\s+/iu,
    ],
    "desodorantes-para-piso-concentrado": [
      /^DESODORANTE(?:S)?\s+(?:PARA|DE)\s+PISO(?:\s+CONCENTRADO(?:S)?)?\s+/iu,
    ],
    difusores: [/^DIFUSOR(?:ES)?(?:\s+DE\s+AMBIENTE)?\s+/iu],
  };
  for (const prefix of prefixes[categorySlug]) {
    const inferred = name.replace(prefix, "").trim();
    if (inferred !== name.trim() && inferred) return inferred;
  }
  return null;
}

function normalizeLookup(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("es-AR");
}

function parseStock(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return null;
  const stock = Number(normalized);
  return Number.isSafeInteger(stock) && stock <= 2_000_000_000 ? stock : null;
}

function parseShowInStore(value: string): boolean | null {
  const normalized = normalizeLookup(value);
  if (normalized === "si") return true;
  if (normalized === "no") return false;
  return null;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ConflictError || error instanceof ValidationError) return error.message;
  return fallback;
}
