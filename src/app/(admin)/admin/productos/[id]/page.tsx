import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/modules/auth/presentation/session";
import { getCatalogAdminService } from "@/modules/catalog/infrastructure/catalog-admin-composition";
import { formatMoney } from "@/shared/domain/money";

export const dynamic = "force-dynamic";

export default async function AdminProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin("catalog.read");
  const { id } = await params;
  const service = getCatalogAdminService();
  const product = await service.findProduct(id).catch(() => null);
  if (!product) notFound();
  const categories = await service.listCategories();
  const categoryNames = categories.filter((category) => product.categoryIds.includes(category.id)).map((category) => category.name);
  return <>
    <div className="admin-heading"><div><p className="eyebrow">Catálogo</p><h1>{product.name}</h1><p>/{product.slug} · actualizado {product.updatedAt.toLocaleString("es-AR")}</p></div><div className="heading-actions"><Link className="button button--secondary" href="/admin/productos">Volver</Link><Link className="button button--dark" href={`/admin/productos/${product.id}/editar`}>Editar producto</Link></div></div>
    <div className="admin-detail-grid"><section className="admin-panel"><div className="panel-heading"><div><p className="eyebrow">General</p><h2>Publicación</h2></div><span className={`status-badge status-badge--${product.status.toLowerCase()}`}>{product.status}</span></div><dl className="detail-list"><dt>Categorías</dt><dd>{categoryNames.join(" · ") || "Sin categoría"}</dd><dt>Destacado</dt><dd>{product.featured ? "Sí" : "No"}</dd><dt>Descripción corta</dt><dd>{product.shortDescription ?? "—"}</dd><dt>Descripción</dt><dd>{product.description ?? "—"}</dd></dl></section>
      <section className="admin-panel"><div className="panel-heading"><div><p className="eyebrow">Imágenes</p><h2>{product.images.length} referencias</h2></div></div>{product.images.length ? <div className="admin-image-grid">{product.images.map((image, index) => <figure key={image.id}><div><Image alt={image.altText} fill sizes="160px" src={image.url} /></div><figcaption>{index === 0 ? "Principal · " : ""}{image.altText}</figcaption></figure>)}</div> : <div className="empty-state empty-state--small"><p>Sin imágenes.</p></div>}</section></div>
    <section className="admin-panel admin-table-wrap"><div className="panel-heading"><div><p className="eyebrow">Unidades vendibles</p><h2>Variantes e inventario</h2></div></div><table className="admin-table"><thead><tr><th>Variante</th><th>SKU</th><th>Precio</th><th>Costo</th><th>Estado</th><th>Físico</th><th>Reservado</th><th>Disponible</th><th>Mínimo</th><th></th></tr></thead><tbody>{product.variants.map((variant) => <tr key={variant.id}><td><strong>{variant.name}</strong>{variant.isDefault ? <small>Predeterminada</small> : null}</td><td>{variant.sku}</td><td>{formatMoney(variant.priceInCents)}</td><td>{variant.costInCents === null ? "—" : formatMoney(variant.costInCents)}</td><td>{variant.isActive ? "Activa" : "Inactiva"}</td><td>{variant.stockOnHand}</td><td>{variant.stockReserved}</td><td><strong>{variant.stockAvailable}</strong></td><td>{variant.minimumStock}</td><td><Link href={`/admin/stock/movimientos?buscar=${encodeURIComponent(variant.sku)}`}>Movimientos</Link></td></tr>)}</tbody></table></section>
  </>;
}
