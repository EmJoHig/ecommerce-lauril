import Link from "next/link";
import { requireAdmin } from "@/modules/auth/presentation/session";
import { orderStatuses } from "@/modules/orders/domain/order";
import { getOrderAdminService } from "@/modules/orders/infrastructure/order-composition";
import { orderStatusClass, orderStatusLabel } from "@/modules/orders/presentation/order-presenter";
import { getShippingAdminService } from "@/modules/shipping/infrastructure/shipping-composition";
import { DomainError } from "@/shared/domain/errors";
import { formatMoney } from "@/shared/domain/money";

export const dynamic = "force-dynamic";
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminOrdersPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin("orders.read");
  const parameters = await searchParams;
  const service = getOrderAdminService();
  const methods = await getShippingAdminService().list();
  let filterError = "";
  let page;
  try {
    page = await service.list({
      page: numberParam(parameters.page), search: textParam(parameters.buscar),
      status: textParam(parameters.estado), ownerType: textParam(parameters.comprador),
      shippingMethodId: textParam(parameters.entrega), createdFrom: textParam(parameters.desde),
      createdTo: textParam(parameters.hasta), sort: textParam(parameters.orden),
    });
  } catch (error) {
    filterError = error instanceof DomainError ? error.message : "Los filtros no son válidos.";
    page = await service.list({});
  }
  return <>
    <div className="admin-heading"><div><p className="eyebrow">Ventas</p><h1>Pedidos</h1><p>{page.total} pedidos encontrados.</p></div></div>
    {filterError ? <div className="form-error" role="alert">{filterError}</div> : null}
    <form className="admin-filters admin-filters--orders">
      <input defaultValue={textParam(parameters.buscar)} name="buscar" placeholder="Número, nombre, email o teléfono" />
      <select defaultValue={textParam(parameters.estado)} name="estado"><option value="">Todos los estados</option>{orderStatuses.map((status) => <option key={status} value={status}>{orderStatusLabel(status)}</option>)}</select>
      <select defaultValue={textParam(parameters.comprador)} name="comprador"><option value="">Clientes e invitados</option><option value="customer">Solo clientes</option><option value="guest">Solo invitados</option></select>
      <select defaultValue={textParam(parameters.entrega)} name="entrega"><option value="">Todos los métodos</option>{methods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}</select>
      <label className="filter-date">Desde<input defaultValue={textParam(parameters.desde)} name="desde" type="date" /></label>
      <label className="filter-date">Hasta<input defaultValue={textParam(parameters.hasta)} name="hasta" type="date" /></label>
      <select defaultValue={textParam(parameters.orden) || "newest"} name="orden"><option value="newest">Más recientes</option><option value="oldest">Más antiguos</option><option value="number-desc">Número descendente</option><option value="number-asc">Número ascendente</option><option value="total-desc">Mayor total</option><option value="total-asc">Menor total</option></select>
      <button className="button button--dark" type="submit">Aplicar</button><Link className="button button--secondary" href="/admin/pedidos">Limpiar</Link>
    </form>
    <section className="admin-panel admin-table-wrap">{page.items.length === 0 ? <div className="empty-state empty-state--small"><h2>No hay resultados</h2><p>Probá modificando los filtros.</p></div> : <table className="admin-table admin-table--orders"><thead><tr><th>Número</th><th>Comprador</th><th>Fecha</th><th>Artículos</th><th>Entrega</th><th>Subtotal</th><th>Envío</th><th>Total</th><th>Estado</th><th></th></tr></thead><tbody>{page.items.map((order) => <tr key={order.id}><td><strong>#{order.number.toString()}</strong></td><td><strong>{order.buyerName}</strong><small>{order.buyerEmail}</small><small>{order.buyerPhone} · {order.customerId ? "Cliente" : "Invitado"}</small></td><td>{order.createdAt.toLocaleString("es-AR")}</td><td>{order.itemCount}</td><td><strong>{order.shippingMethodName}</strong><small>{order.shippingMethodType}</small></td><td>{formatMoney(order.itemsSubtotalInCents)}</td><td>{formatMoney(order.shippingAmountInCents)}</td><td><strong>{formatMoney(order.totalInCents)}</strong></td><td><span className={`status-badge status-badge--${orderStatusClass(order.status)}`}>{orderStatusLabel(order.status)}</span></td><td><Link href={`/admin/pedidos/${order.id}`}>Ver</Link></td></tr>)}</tbody></table>}</section>
    <nav className="pagination" aria-label="Paginación"><Link aria-disabled={page.page <= 1} href={pageHref(parameters, page.page - 1)}>← Anterior</Link><span>Página {page.page} de {page.pageCount}</span><Link aria-disabled={page.page >= page.pageCount} href={pageHref(parameters, page.page + 1)}>Siguiente →</Link></nav>
  </>;
}

function textParam(value: string | string[] | undefined): string { return typeof value === "string" ? value : ""; }
function numberParam(value: string | string[] | undefined): number { const parsed = Number(textParam(value)); return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1; }
function pageHref(parameters: Record<string, string | string[] | undefined>, page: number): string { const query = new URLSearchParams(); for (const [key, value] of Object.entries(parameters)) if (typeof value === "string" && key !== "page" && value) query.set(key, value); query.set("page", String(Math.max(1, page))); return `/admin/pedidos?${query}`; }
