import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("catalog import workbook", () => {
  it("lee encabezados legados y conserva los valores monetarios como texto", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Productos");
    sheet.addRow(["Nombre", "Stock", "SKU", "Precio", "Precio oferta", "Categorías", "Mostrar en tienda", "Descripción", "IDProduct"]);
    sheet.addRow(["BRUMA AROMATICA TEXTIL UVA", "100", "BAT-017", "4500", null, "Perfuminas textiles", "Si", null, 1]);
    const buffer = await workbook.xlsx.writeBuffer();
    const { parseCatalogImportWorkbook } = await import("@/modules/catalog/infrastructure/catalog-import-workbook");
    const source = await parseCatalogImportWorkbook(new Uint8Array(buffer));
    expect(source).toMatchObject({ hasFragranceColumn: false, allowLegacyFragranceInference: true, workbookErrors: [], rows: [{ rowNumber: 2, sku: "BAT-017", price: "4500", category: "Perfuminas textiles" }] });
  });

  it("genera la plantilla con el orden requerido y listas desplegables", async () => {
    const { createCatalogImportTemplate } = await import("@/modules/catalog/infrastructure/catalog-import-workbook");
    const bytes = await createCatalogImportTemplate();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes.buffer as never);
    const sheet = workbook.getWorksheet("Productos");
    expect(sheet?.getRow(1).values).toEqual([undefined, "Nombre", "SKU", "Categoría", "Fragancia", "Precio", "Precio oferta", "Stock", "Mostrar en tienda", "Descripción"]);
    expect(sheet?.getCell("C2").dataValidation.type).toBe("list");
    expect(sheet?.getCell("H2").dataValidation.formulae).toEqual(['"Si,No"']);
  });
});
