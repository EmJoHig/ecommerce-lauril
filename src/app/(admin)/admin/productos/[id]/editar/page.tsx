import { notFound } from "next/navigation";
import { requireAdmin } from "@/modules/auth/presentation/session";
import { getCatalogAdminService } from "@/modules/catalog/infrastructure/catalog-admin-composition";
import { ProductForm, type ProductFormModel } from "@/modules/catalog/presentation/product-form";
import { formatMoneyInput } from "@/shared/domain/money";

export const dynamic = "force-dynamic";
export default async function EditProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ guardado?: string }> }) {
  await requireAdmin("catalog.write");
  const { id } = await params; const service = getCatalogAdminService();
  const [product, categories, query] = await Promise.all([service.findProduct(id), service.listCategories(), searchParams]);
  if (!product || product.status === "ARCHIVED") notFound();
  const initial: ProductFormModel = { id: product.id, name: product.name, slug: product.slug, shortDescription: product.shortDescription ?? "", description: product.description ?? "", status: product.status, featured: product.featured, categoryIds: product.categoryIds, images: product.images.map((image) => ({ id: image.id, url: image.url, altText: image.altText, sortOrder: image.sortOrder })), variants: product.variants.map((variant) => ({ clientId: variant.id, id: variant.id, sku: variant.sku, name: variant.name, price: formatMoneyInput(variant.priceInCents), promotionalPrice: variant.promotionalPriceInCents === null ? "" : formatMoneyInput(variant.promotionalPriceInCents), cost: variant.costInCents === null ? "" : formatMoneyInput(variant.costInCents), isDefault: variant.isDefault, isActive: variant.isActive, initialStock: 0, stockOnHand: variant.stockOnHand, stockReserved: variant.stockReserved, minimumStock: variant.minimumStock })) };
  return <><div className="admin-heading"><div><p className="eyebrow">Catálogo</p><h1>Editar producto</h1><p>{product.name}</p></div></div>{query.guardado === "1" ? <div className="action-success action-banner">Cambios guardados correctamente.</div> : null}<ProductForm categories={categories.map(({ id: categoryId, name, isActive }) => ({ id: categoryId, name, isActive }))} initial={initial} /></>;
}
