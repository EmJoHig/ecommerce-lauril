import { describe, expect, it } from "vitest";
import {
  CatalogImportService,
  mapCommercialCategory,
  normalizeFragrance,
  type CatalogImportRepository,
  type CatalogImportSource,
  validateCatalogImport,
} from "@/modules/catalog/application/catalog-import";
import { CatalogService } from "@/modules/catalog/application/catalog-service";
import type { ProductCatalogRepository } from "@/modules/catalog/application/product-catalog-repository";
import { ValidationError } from "@/shared/domain/errors";

const actorId = "7bcaa109-9007-4f1c-bf56-bc4eaaf05647";

function source(rows: CatalogImportSource["rows"], hasFragranceColumn = true): CatalogImportSource {
  return { rows, hasFragranceColumn, allowLegacyFragranceInference: !hasFragranceColumn, workbookErrors: [] };
}

function row(overrides: Partial<CatalogImportSource["rows"][number]> = {}) {
  return {
    rowNumber: 2,
    name: "BRUMA AROMATICA TEXTIL LAVANDA",
    sku: "BAT-011",
    category: "Perfuminas",
    fragrance: "Lavanda",
    price: "4500",
    promotionalPrice: "",
    stock: "100",
    showInStore: "Si",
    description: "",
    ...overrides,
  };
}

describe("catalog Excel import", () => {
  it("mapea la categoría legado, infiere fragancia y convierte el precio a centavos", () => {
    const preview = validateCatalogImport(source([row({ category: "Perfuminas textiles", fragrance: "" })], false));
    expect(preview.errors).toEqual([]);
    expect(preview.rows[0]).toMatchObject({ categoryName: "Perfuminas", fragrance: "Lavanda", fragranceKey: "lavanda", priceInCents: 450000n });
  });

  it("exige fragancia cuando la plantilla incluye esa columna", () => {
    const preview = validateCatalogImport(source([row({ fragrance: "" })]));
    expect(preview.errors).toContainEqual({ row: 2, reason: "Fragancia obligatoria." });
  });

  it("normaliza categorías equivalentes y deduplica fragancias conceptualmente", () => {
    expect(mapCommercialCategory("DESODORANTES concentrados para piso")?.name).toBe("Desodorantes para piso concentrado");
    expect(normalizeFragrance("  lÁVANDA ")?.key).toBe("lavanda");
    const preview = validateCatalogImport(source([
      row({ fragrance: "Lavanda" }),
      row({ rowNumber: 3, sku: "DIF-001", name: "Difusor Lavanda", category: "Difusores", fragrance: "  LÁVANDA  " }),
    ]));
    expect(preview.fragrances).toEqual(["Lavanda"]);
  });

  it("reporta fila y motivo para SKU repetido, stock y visibilidad inválidos", () => {
    const preview = validateCatalogImport(source([
      row(),
      row({ rowNumber: 3, sku: "bat-011", stock: "1,5", showInStore: "tal vez" }),
    ]));
    expect(preview.errors.filter(({ row: number }) => number === 3).map(({ reason }) => reason)).toEqual(expect.arrayContaining([
      "SKU repetido; ya aparece en la fila 2.",
      "Stock debe ser un entero mayor o igual a 0.",
      'Mostrar en tienda debe ser "Si" o "No".',
    ]));
  });

  it("evita una importación parcial si existe cualquier error", async () => {
    let called = false;
    const repository: CatalogImportRepository = {
      importProducts: async () => { called = true; return { created: 0, updated: 0, products: 0, categories: 0, fragrances: 0 }; },
    };
    await expect(new CatalogImportService(repository).import(source([row({ price: "" })]), actorId)).rejects.toBeInstanceOf(ValidationError);
    expect(called).toBe(false);
  });

  it("combina fragancia con categoría, búsqueda y ordenamiento en la consulta", async () => {
    let received: unknown;
    const repository: ProductCatalogRepository = {
      listProducts: async () => [],
      listProductPage: async (input) => { received = input; return { items: [], total: 0, page: 1, pageSize: 12, pageCount: 1 }; },
      findBySlug: async () => null,
      listCategories: async () => [],
      listFragrances: async () => [],
    };
    await new CatalogService(repository).listFilteredProductPage({ categorySlug: "perfuminas", fragrance: "LÁVANDA", search: "BAT", sort: "name-asc" });
    expect(received).toMatchObject({ categorySlug: "perfuminas", fragranceKey: "lavanda", search: "BAT", sort: "name-asc" });
  });
});
