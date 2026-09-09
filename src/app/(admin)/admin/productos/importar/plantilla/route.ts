import { requireAdmin } from "@/modules/auth/presentation/session";
import { createCatalogImportTemplate } from "@/modules/catalog/infrastructure/catalog-import-workbook";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireAdmin("catalog.write");
  const bytes = await createCatalogImportTemplate();
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Response(body, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plantilla-importacion-productos-lauril.xlsx"',
      "Cache-Control": "private, no-store",
    },
  });
}
