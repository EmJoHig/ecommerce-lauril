import { requireAdmin } from "@/modules/auth/presentation/session";
import { CatalogImportForm } from "@/modules/catalog/presentation/catalog-import-form";

export const dynamic = "force-dynamic";

export default async function CatalogImportPage() {
  await requireAdmin("catalog.write");
  return <>
    <div className="admin-heading"><div><p className="eyebrow">Catálogo</p><h1>Importar productos</h1><p>Validá el Excel y revisá los errores antes de confirmar.</p></div></div>
    <CatalogImportForm />
  </>;
}
