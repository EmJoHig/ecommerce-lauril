import Image from "next/image";
import Link from "next/link";
import { requireAdmin } from "@/modules/auth/presentation/session";
import { getCatalogAdminService } from "@/modules/catalog/infrastructure/catalog-admin-composition";
import { setProductStatusAction } from "@/modules/catalog/presentation/catalog-actions";
import { formatMoney } from "@/shared/domain/money";

export const dynamic = "force-dynamic";
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminProductsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin("catalog.read");
  const parameters = await searchParams;
  const service = getCatalogAdminService();
  const categories = await service.listCategories();
  const page = await service.listProducts({ page: numberParam(parameters.page), search: textParam(parameters.buscar), status: textParam(parameters.estado), categoryId: textParam(parameters.categoria), sort: textParam(parameters.orden) });
  return <>
    <div className="admin-heading"><div><p className="eyebrow">Catálogo</p><h1>Productos</h1><p>{page.total} productos encontrados.</p></div><Link className="button button--dark" href="/admin/productos/nuevo">Nuevo producto</Link></div>
    {textParam(parameters.error) ? <div className="form-error" role="alert">{textParam(parameters.error)}</div> : null}
    <form className="admin-filters"><input defaultValue={textParam(parameters.buscar)} name="buscar" placeholder="Buscar por nombre o SKU" /><select defaultValue={textParam(parameters.estado)} name="estado"><option value="">Todos los estados</option><option value="ACTIVE">Activos</option><option value="INACTIVE">Inactivos</option><option value="DRAFT">Borradores</option></select><select defaultValue={textParam(parameters.categoria)} name="categoria"><option value="">Todas las categorías</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><select defaultValue={textParam(parameters.orden) || "updated-desc"} name="orden"><option value="updated-desc">Actualizados recientemente</option><option value="updated-asc">Actualizados primero</option><option value="name-asc">Nombre A–Z</option><option value="name-desc">Nombre Z–A</option></select><button className="button button--dark" type="submit">Aplicar</button><Link className="button button--secondary" href="/admin/productos">Limpiar</Link></form>
    <section className="admin-panel admin-table-wrap">{page.items.length === 0 ? <div className="empty-state empty-state--small"><h2>No hay resultados</h2><p>Probá modificando los filtros.</p></div> : <table className="admin-table admin-table--products"><thead><tr><th>Imagen</th><th>Producto</th><th>SKU</th><th>Categoría</th><th>Precio</th><th>Stock</th><th>Estado</th><th>Actualizado</th><th>Acciones</th></tr></thead><tbody>{page.items.map((product) => <tr key={product.id}><td><div className="admin-thumb"><Image alt={product.imageAlt ?? product.name} fill sizes="56px" src={product.imageUrl ?? "/product-placeholder.svg"} /></div></td><td><strong>{product.name}</strong><small>/{product.slug}</small></td><td>{product.primarySku}</td><td>{product.categoryNames.join(" · ") || "Sin categoría"}</td><td>{formatMoney(product.priceInCents)}</td><td>{product.availableStock}</td><td><span className={`status-badge status-badge--${product.status.toLowerCase()}`}>{product.status}</span></td><td>{product.updatedAt.toLocaleDateString("es-AR")}</td><td><div className="table-actions"><Link href={`/admin/productos/${product.id}/editar`}>Editar</Link>{product.status === "ACTIVE" ? <Link href={`/producto/${product.slug}`} target="_blank">Ver</Link> : null}<form action={setProductStatusAction}><input name="id" type="hidden" value={product.id} /><input name="status" type="hidden" value={product.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"} /><button type="submit">{product.status === "ACTIVE" ? "Desactivar" : "Activar"}</button></form></div></td></tr>)}</tbody></table>}</section>
    <nav className="pagination" aria-label="Paginación"><Link aria-disabled={page.page <= 1} href={pageHref(parameters, page.page - 1)}>← Anterior</Link><span>Página {page.page} de {page.pageCount}</span><Link aria-disabled={page.page >= page.pageCount} href={pageHref(parameters, page.page + 1)}>Siguiente →</Link></nav>
  </>;
}

function textParam(value: string | string[] | undefined): string { return typeof value === "string" ? value : ""; }
function numberParam(value: string | string[] | undefined): number { const parsed = Number(textParam(value)); return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1; }
function pageHref(parameters: Record<string, string | string[] | undefined>, page: number): string { const query = new URLSearchParams(); for (const [key, value] of Object.entries(parameters)) if (typeof value === "string" && key !== "page" && value) query.set(key, value); query.set("page", String(Math.max(1, page))); return `/admin/productos?${query}`; }
