import Link from "next/link";
import { requireAdmin } from "@/modules/auth/presentation/session";
import { getInventoryAdminService } from "@/modules/inventory/infrastructure/inventory-admin-composition";
import { InventoryAdjustmentForm } from "@/modules/inventory/presentation/inventory-adjustment-form";
import { adminPageHref, pageParam, textParam, type AdminSearchParams } from "@/shared/presentation/admin-search-params";

export const dynamic = "force-dynamic";

export default async function AdminStockPage({ searchParams }: { searchParams: Promise<AdminSearchParams> }) {
  await requireAdmin("inventory.read");
  const parameters = await searchParams;
  const page = await getInventoryAdminService().listInventory({
    page: pageParam(parameters.page), search: textParam(parameters.buscar),
    lowStock: textParam(parameters.bajo), sort: textParam(parameters.orden),
  });
  return <>
    <div className="admin-heading"><div><p className="eyebrow">Inventario</p><h1>Stock por variante</h1><p>{page.total} unidades vendibles. El disponible se calcula siempre en dominio.</p></div><Link className="button button--secondary" href="/admin/stock/movimientos">Ver movimientos</Link></div>
    <form className="admin-filters"><input defaultValue={textParam(parameters.buscar)} name="buscar" placeholder="Producto, variante o SKU" /><select defaultValue={textParam(parameters.bajo)} name="bajo"><option value="">Todo el inventario</option><option value="true">Solo stock bajo</option></select><select defaultValue={textParam(parameters.orden) || "updated-desc"} name="orden"><option value="updated-desc">Actualizados recientemente</option><option value="product-asc">Producto A–Z</option><option value="stock-asc">Menor stock físico</option><option value="stock-desc">Mayor stock físico</option></select><button className="button button--dark" type="submit">Aplicar</button><Link className="button button--secondary" href="/admin/stock">Limpiar</Link></form>
    <section className="admin-panel admin-table-wrap">{page.items.length ? <table className="admin-table admin-table--stock"><thead><tr><th>Producto / variante</th><th>SKU</th><th>Físico</th><th>Reservado</th><th>Disponible</th><th>Mínimo</th><th>Ajuste manual</th></tr></thead><tbody>{page.items.map((row) => <tr key={row.id}><td><strong><Link href={`/admin/productos/${row.productId}`}>{row.productName}</Link></strong><small>{row.variantName}</small></td><td><Link href={`/admin/stock/movimientos?buscar=${encodeURIComponent(row.sku)}`}>{row.sku}</Link></td><td>{row.stockOnHand}</td><td>{row.stockReserved}</td><td><span className={row.isLowStock ? "stock stock--out" : "stock stock--ok"}>{row.stockAvailable}</span></td><td>{row.minimumStock}</td><td><InventoryAdjustmentForm inventoryId={row.id} /></td></tr>)}</tbody></table> : <div className="empty-state empty-state--small"><h2>No hay resultados</h2></div>}</section>
    <nav className="pagination" aria-label="Paginación"><Link aria-disabled={page.page <= 1} href={adminPageHref("/admin/stock", parameters, page.page - 1)}>← Anterior</Link><span>Página {page.page} de {page.pageCount}</span><Link aria-disabled={page.page >= page.pageCount} href={adminPageHref("/admin/stock", parameters, page.page + 1)}>Siguiente →</Link></nav>
  </>;
}
