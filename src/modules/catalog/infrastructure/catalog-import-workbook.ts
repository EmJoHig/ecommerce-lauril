import "server-only";

import ExcelJS from "exceljs";
import JSZip from "jszip";
import type { CatalogImportSource } from "../application/catalog-import";
import { COMMERCIAL_CATEGORIES } from "../application/catalog-import";

const MAX_ROWS = 5_000;
const SPREADSHEET_NAMESPACE = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

const fields = {
  name: ["nombre"],
  sku: ["sku"],
  category: ["categoria", "categorias"],
  fragrance: ["fragancia"],
  price: ["precio"],
  promotionalPrice: ["precio oferta"],
  stock: ["stock"],
  showInStore: ["mostrar en tienda"],
  description: ["descripcion"],
} as const;

export async function parseCatalogImportWorkbook(bytes: Uint8Array): Promise<CatalogImportSource> {
  const workbook = new ExcelJS.Workbook();
  const compatibleBytes = await normalizeSpreadsheetNamespacePrefixes(bytes);
  const input = compatibleBytes.buffer.slice(
    compatibleBytes.byteOffset,
    compatibleBytes.byteOffset + compatibleBytes.byteLength,
  ) as ArrayBuffer;
  await workbook.xlsx.load(input as never);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return { hasFragranceColumn: false, allowLegacyFragranceInference: false, rows: [], workbookErrors: ["El archivo no contiene hojas."] };
  }

  const headers = new Map<string, number>();
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, column) => {
    const header = normalizeHeader(cell.text);
    if (header && !headers.has(header)) headers.set(header, column);
  });
  const workbookErrors: string[] = [];
  for (const required of ["name", "sku", "category", "price", "stock", "showInStore"] as const) {
    if (!columnFor(headers, fields[required])) {
      workbookErrors.push(`Falta la columna "${displayHeader(required)}".`);
    }
  }
  const hasFragranceColumn = Boolean(columnFor(headers, fields.fragrance));
  const allowLegacyFragranceInference = !hasFragranceColumn && (headers.has("idproduct") || headers.has("idstock"));
  if (!hasFragranceColumn && !allowLegacyFragranceInference) {
    workbookErrors.push('Falta la columna "Fragancia".');
  }
  if (worksheet.actualRowCount - 1 > MAX_ROWS) {
    workbookErrors.push(`El archivo supera el máximo de ${MAX_ROWS} filas.`);
  }

  const rows: CatalogImportSource["rows"][number][] = [];
  const lastRow = Math.min(worksheet.actualRowCount, MAX_ROWS + 1);
  for (let rowNumber = 2; rowNumber <= lastRow; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const values = {
      rowNumber,
      name: cellText(row, headers, fields.name),
      sku: cellText(row, headers, fields.sku),
      category: cellText(row, headers, fields.category),
      fragrance: cellText(row, headers, fields.fragrance),
      price: cellText(row, headers, fields.price),
      promotionalPrice: cellText(row, headers, fields.promotionalPrice),
      stock: cellText(row, headers, fields.stock),
      showInStore: cellText(row, headers, fields.showInStore),
      description: cellText(row, headers, fields.description),
    };
    if ([values.name, values.sku, values.category, values.fragrance, values.price, values.promotionalPrice, values.stock, values.showInStore, values.description].some((value) => value.trim())) rows.push(values);
  }

  if (rows.length === 0) workbookErrors.push("El archivo no contiene productos.");
  return { hasFragranceColumn, allowLegacyFragranceInference, rows, workbookErrors };
}

async function normalizeSpreadsheetNamespacePrefixes(bytes: Uint8Array): Promise<Uint8Array> {
  const archive = await JSZip.loadAsync(bytes);
  let changed = false;

  await Promise.all(Object.values(archive.files).map(async (entry) => {
    if (entry.dir || !entry.name.startsWith("xl/") || !entry.name.endsWith(".xml")) return;

    const xml = await entry.async("string");
    const namespacePattern = new RegExp(`xmlns:([A-Za-z_][\\w.-]*)=["']${SPREADSHEET_NAMESPACE}["']`, "g");
    const prefixes = [...xml.matchAll(namespacePattern)].map((match) => match[1]);
    if (prefixes.length === 0) return;

    let normalizedXml = xml.replace(namespacePattern, `xmlns="${SPREADSHEET_NAMESPACE}"`);
    for (const prefix of prefixes) {
      normalizedXml = normalizedXml
        .replaceAll(`<${prefix}:`, "<")
        .replaceAll(`</${prefix}:`, "</");
    }

    archive.file(entry.name, normalizedXml);
    changed = true;
  }));

  if (!changed) return bytes;
  return archive.generateAsync({ type: "uint8array" });
}

export async function createCatalogImportTemplate(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Lauril Ecommerce";
  const worksheet = workbook.addWorksheet("Productos", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const headers = [
    "Nombre",
    "SKU",
    "Categoría",
    "Fragancia",
    "Precio",
    "Precio oferta",
    "Stock",
    "Mostrar en tienda",
    "Descripción",
  ];
  worksheet.addRow(headers);
  worksheet.addRows([
    ["EJEMPLO - Perfumina Lavanda", "EJEMPLO-001", "Perfuminas", "Lavanda", 4500, null, 10, "Si", "Fila ficticia de ejemplo."],
    ["EJEMPLO - Desodorante Citrus", "EJEMPLO-002", "Desodorantes para piso concentrado", "Citrus", 5200, 4900, 8, "Si", "Fila ficticia de ejemplo."],
    ["EJEMPLO - Difusor Vainilla", "EJEMPLO-003", "Difusores", "Vainilla", 6100, null, 0, "No", "Fila ficticia de ejemplo."],
  ]);

  worksheet.columns = [
    { width: 34 }, { width: 18 }, { width: 39 }, { width: 20 }, { width: 14 },
    { width: 16 }, { width: 11 }, { width: 20 }, { width: 38 },
  ];
  const header = worksheet.getRow(1);
  header.height = 24;
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF171717" } };
  header.alignment = { vertical: "middle", horizontal: "center" };
  worksheet.autoFilter = { from: "A1", to: "I4" };
  worksheet.getColumn(5).numFmt = "#,##0.00";
  worksheet.getColumn(6).numFmt = "#,##0.00";
  worksheet.getColumn(7).numFmt = "0";

  const categoryList = COMMERCIAL_CATEGORIES.map(({ name }) => name).join(",");
  for (let row = 2; row <= 1001; row += 1) {
    worksheet.getCell(`C${row}`).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [`"${categoryList}"`],
      showErrorMessage: true,
      errorTitle: "Categoría inválida",
      error: "Elegí una de las tres categorías permitidas.",
    };
    worksheet.getCell(`H${row}`).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: ['"Si,No"'],
      showErrorMessage: true,
      errorTitle: "Valor inválido",
      error: 'Elegí "Si" o "No".',
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

function cellText(
  row: ExcelJS.Row,
  headers: Map<string, number>,
  aliases: readonly string[],
): string {
  const column = columnFor(headers, aliases);
  return column ? row.getCell(column).text.trim() : "";
}

function columnFor(headers: Map<string, number>, aliases: readonly string[]): number | undefined {
  for (const alias of aliases) {
    const column = headers.get(alias);
    if (column) return column;
  }
  return undefined;
}

function normalizeHeader(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("es-AR");
}

function displayHeader(field: keyof typeof fields): string {
  const names: Record<keyof typeof fields, string> = {
    name: "Nombre", sku: "SKU", category: "Categoría", fragrance: "Fragancia",
    price: "Precio", promotionalPrice: "Precio oferta", stock: "Stock",
    showInStore: "Mostrar en tienda", description: "Descripción",
  };
  return names[field];
}
