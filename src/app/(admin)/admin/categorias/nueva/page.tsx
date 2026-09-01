import { requireAdmin } from "@/modules/auth/presentation/session";
import { getCatalogAdminService } from "@/modules/catalog/infrastructure/catalog-admin-composition";
import { CategoryForm } from "@/modules/catalog/presentation/category-form";

export const dynamic = "force-dynamic";
export default async function NewCategoryPage() { await requireAdmin("catalog.write"); const categories = await getCatalogAdminService().listCategories(); return <><div className="admin-heading"><div><p className="eyebrow">Catálogo</p><h1>Nueva categoría</h1><p>Organizá productos sin crear ciclos en la jerarquía.</p></div></div><CategoryForm categories={categories.map(({ id, name, parentId }) => ({ id, name, parentId }))} initial={{ parentId: null, name: "", slug: "", description: "", isActive: true, sortOrder: categories.length }} /></>; }
