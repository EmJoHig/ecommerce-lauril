import { requireAdmin } from "@/modules/auth/presentation/session";
import { getCatalogAdminService } from "@/modules/catalog/infrastructure/catalog-admin-composition";
import { ProductForm, type ProductFormModel } from "@/modules/catalog/presentation/product-form";

export const dynamic = "force-dynamic";
export default async function NewProductPage() {
  await requireAdmin("catalog.write");
  const categories = await getCatalogAdminService().listCategories();
  const initial: ProductFormModel = { name: "", slug: "", shortDescription: "", description: "", status: "DRAFT", featured: false, categoryIds: [], images: [], variants: [{ clientId: "new-default", sku: "", name: "Única", price: "", promotionalPrice: "", cost: "", isDefault: true, isActive: true, initialStock: 0, stockOnHand: 0, stockReserved: 0, minimumStock: 0 }] };
  return <><div className="admin-heading"><div><p className="eyebrow">Catálogo</p><h1>Nuevo producto</h1><p>Producto, variante e inventario se crean en una única transacción.</p></div></div><ProductForm categories={categories.map(({ id, name, isActive }) => ({ id, name, isActive }))} initial={initial} /></>;
}
