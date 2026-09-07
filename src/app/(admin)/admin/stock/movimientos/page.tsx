import Link from "next/link";
import { requireAdmin } from "@/modules/auth/presentation/session";
import { inventoryMovementTypes } from "@/modules/inventory/domain/inventory";
import { getInventoryAdminService } from "@/modules/inventory/infrastructure/inventory-admin-composition";
import { DomainError } from "@/shared/domain/errors";
import { adminPageHref, pageParam, textParam, type AdminSearchParams } from "@/shared/presentation/admin-search-params";

export const dynamic = "force-dynamic";

export default async function AdminInventoryMovementsPage({ searchParams }: { searchParams: Promise<AdminSearchParams> }) {
  await requireAdmin("inventory.read");
  const parameters = await searchParams;
  const service = getInventoryAdminService();
  let error = "";
  let page;
  try {
    page = await service.listMovements({
      page: pageParam(parameters.page), search: textParam(parameters.buscar), type: textParam(parameters.tipo),
      createdFrom: textParam(parameters.desde), createdTo: textParam(parameters.hasta),
    });
  } catch (caught) {
    error = caught instanceof DomainError ? caught.message : "Los filtros no son válidos.";
    page = await service.listMovements({});
  }
  return <>
    <div className="admin-heading"><div><p className="eyebrow">Trazabilidad</p><h1>Movimientos de inventario</h1><p>{page.total} registros inmutables.</p></div><Link className="button button--secondary" href="/admin/stock">Volver a stock</Link></div>
    {error ? <div className="form-error" role="alert">{error}</div> : null}
    <form className="admin-filters"><input defaultValue={textParam(parameters.buscar)} name="buscar" placeholder="Producto, SKU o motivo" /><select defaultValue={textParam(parameters.tipo)} name="tipo"><option value="">Todos los tipos</option>{inventoryMovementTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select><label className="filter-date">Desde<input defaultValue={textParam(parameters.desde)} name="desde" type="date" /></label><label className="filter-date">Hasta<input defaultValue={textParam(parameters.hasta)} name="hasta" type="date" /></label><button className="button button--dark" type="submit">Aplicar</button><Link className="button button--secondary" href="/admin/stock/movimientos">Limpiar</Link></form>
    <section className="admin-panel admin-table-wrap">{page.items.length ? <table className="admin-table"><thead><tr><th>Fecha</th><th>Producto / variante</th><th>Tipo</th><th>Cantidad</th><th>Antes</th><th>Después</th><th>Motivo</th><th>Referencia</th><th>Actor</th></tr></thead><tbody>{page.items.map((movement) => <tr key={movement.id}><td>{movement.createdAt.toLocaleString("es-AR")}</td><td><strong><Link href={`/admin/productos/${movement.productId}`}>{movement.productName}</Link></strong><small>{movement.variantName} · {movement.sku}</small></td><td>{movement.type}</td><td>{movement.quantity > 0 ? `+${movement.quantity}` : movement.quantity}</td><td>{movement.stockBefore}</td><td>{movement.stockAfter}</td><td>{movement.reason}</td><td>{movement.referenceType && movement.referenceId ? <><strong>{movement.referenceType}</strong><small>{movement.referenceId}</small></> : "—"}</td><td>{movement.actorName}{movement.actorEmail ? <small>{movement.actorEmail}</small> : null}</td></tr>)}</tbody></table> : <div className="empty-state empty-state--small"><h2>No hay movimientos</h2><p>Los movimientos no se editan ni eliminan.</p></div>}</section>
    <nav className="pagination" aria-label="Paginación"><Link aria-disabled={page.page <= 1} href={adminPageHref("/admin/stock/movimientos", parameters, page.page - 1)}>← Anterior</Link><span>Página {page.page} de {page.pageCount}</span><Link aria-disabled={page.page >= page.pageCount} href={adminPageHref("/admin/stock/movimientos", parameters, page.page + 1)}>Siguiente →</Link></nav>
  </>;
}
