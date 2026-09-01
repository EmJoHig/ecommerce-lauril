import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCatalogService } from "@/modules/catalog/infrastructure/catalog-composition";
import { PublicCatalog } from "@/modules/catalog/presentation/public-catalog";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params; const category = (await getCatalogService().listCategories()).find((item) => item.slug === slug);
  if (!category) return {};
  return { title: category.name, description: category.description ?? `Productos de ${category.name} en Lauril.`, alternates: { canonical: `/categorias/${category.slug}` } };
}

export default async function CategoryPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]); const catalog = getCatalogService(); const categories = await catalog.listCategories(); const category = categories.find((item) => item.slug === slug); if (!category) notFound(); const search = text(query.buscar); const sort = text(query.orden); const page = await catalog.listProductPage({ categorySlug: category.slug, page: positive(query.pagina), pageSize: 12, search, sort: validSort(sort) }); return <PublicCatalog categories={categories} currentCategory={category.slug} heading={category.name} page={page} search={search} sort={sort} />;
}

function text(value: string | string[] | undefined) { return typeof value === "string" ? value : ""; }
function positive(value: string | string[] | undefined) { const number = Number(text(value)); return Number.isSafeInteger(number) && number > 0 ? number : 1; }
function validSort(value: string): "featured" | "newest" | "name-asc" | "name-desc" { return ["newest", "name-asc", "name-desc"].includes(value) ? value as "newest" | "name-asc" | "name-desc" : "featured"; }
