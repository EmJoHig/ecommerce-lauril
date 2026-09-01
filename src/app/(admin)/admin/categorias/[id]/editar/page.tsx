import { notFound } from "next/navigation";
import { requireAdmin } from "@/modules/auth/presentation/session";
import { getCatalogAdminService } from "@/modules/catalog/infrastructure/catalog-admin-composition";
import { CategoryForm } from "@/modules/catalog/presentation/category-form";

export const dynamic = "force-dynamic";
export default async function EditCategoryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ guardado?: string }> }) { await requireAdmin("catalog.write"); const { id } = await params; const service = getCatalogAdminService(); const [category, categories, query] = await Promise.all([service.findCategory(id), service.listCategories(), searchParams]); if (!category) notFound(); return <><div className="admin-heading"><div><p className="eyebrow">Catálogo</p><h1>Editar categoría</h1><p>{category.name}</p></div></div>{query.guardado === "1" ? <div className="action-success action-banner">Categoría guardada.</div> : null}<CategoryForm categories={categories.map(({ id: categoryId, name, parentId }) => ({ id: categoryId, name, parentId }))} initial={{ id: category.id, parentId: category.parentId, name: category.name, slug: category.slug, description: category.description ?? "", isActive: category.isActive, sortOrder: category.sortOrder }} /></>; }
