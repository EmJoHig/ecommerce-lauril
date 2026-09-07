import type { Metadata } from "next";
import { getCatalogService } from "@/modules/catalog/infrastructure/catalog-composition";
import { PublicCatalog } from "@/modules/catalog/presentation/public-catalog";
import { getPublicStoreSettings } from "@/modules/store-settings/infrastructure/store-settings-composition";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPublicStoreSettings();
  return { title: "Tienda", description: `Explorá todos los productos y categorías de ${settings.storeName}.`, alternates: { canonical: "/productos" } };
}

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams; const category = text(query.categoria); const search = text(query.buscar); const sort = text(query.orden);
  const catalog = getCatalogService();
  const [page, categories, settings] = await Promise.all([catalog.listProductPage({ page: positive(query.pagina), pageSize: 12, search, sort: validSort(sort), ...(category ? { categorySlug: category } : {}) }), catalog.listCategories(), getPublicStoreSettings()]);
  return <PublicCatalog categories={categories} currentCategory={category || undefined} page={page} search={search} sort={sort} storeName={settings.storeName} />;
}

function text(value: string | string[] | undefined) { return typeof value === "string" ? value : ""; }
function positive(value: string | string[] | undefined) { const number = Number(text(value)); return Number.isSafeInteger(number) && number > 0 ? number : 1; }
function validSort(value: string): "featured" | "newest" | "name-asc" | "name-desc" { return ["newest", "name-asc", "name-desc"].includes(value) ? value as "newest" | "name-asc" | "name-desc" : "featured"; }
