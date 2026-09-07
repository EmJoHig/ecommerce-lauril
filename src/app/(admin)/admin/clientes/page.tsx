import Link from "next/link";
import { requireAdmin } from "@/modules/auth/presentation/session";
import { getCustomerAdminService } from "@/modules/customers/infrastructure/customer-admin-composition";
import { DomainError } from "@/shared/domain/errors";
import { adminPageHref, pageParam, textParam, type AdminSearchParams } from "@/shared/presentation/admin-search-params";

export const dynamic = "force-dynamic";

export default async function AdminCustomersPage({ searchParams }: { searchParams: Promise<AdminSearchParams> }) {
  await requireAdmin("customers.read");
  const parameters = await searchParams;
  const service = getCustomerAdminService();
  let error = "";
  let page;
  try {
    page = await service.list({
      page: pageParam(parameters.page), search: textParam(parameters.buscar), status: textParam(parameters.estado),
      orderPresence: textParam(parameters.pedidos), createdFrom: textParam(parameters.desde),
      createdTo: textParam(parameters.hasta), sort: textParam(parameters.orden),
    });
  } catch (caught) {
    error = caught instanceof DomainError ? caught.message : "Los filtros no son válidos.";
    page = await service.list({});
  }
  return <>
    <div className="admin-heading"><div><p className="eyebrow">Relaciones</p><h1>Clientes</h1><p>{page.total} clientes encontrados.</p></div></div>
    {error ? <div className="form-error" role="alert">{error}</div> : null}
    <form className="admin-filters admin-filters--customers">
      <input defaultValue={textParam(parameters.buscar)} name="buscar" placeholder="Nombre, email o teléfono" />
      <select defaultValue={textParam(parameters.estado)} name="estado"><option value="">Todos los estados</option><option value="ACTIVE">Activos</option><option value="DISABLED">Deshabilitados</option></select>
      <select defaultValue={textParam(parameters.pedidos)} name="pedidos"><option value="">Con y sin pedidos</option><option value="with-orders">Con pedidos</option><option value="without-orders">Sin pedidos</option></select>
      <label className="filter-date">Desde<input defaultValue={textParam(parameters.desde)} name="desde" type="date" /></label>
      <label className="filter-date">Hasta<input defaultValue={textParam(parameters.hasta)} name="hasta" type="date" /></label>
      <select defaultValue={textParam(parameters.orden) || "newest"} name="orden"><option value="newest">Más recientes</option><option value="oldest">Más antiguos</option><option value="updated-desc">Actualizados recientemente</option><option value="name-asc">Apellido A–Z</option><option value="name-desc">Apellido Z–A</option></select>
      <button className="button button--dark" type="submit">Aplicar</button><Link className="button button--secondary" href="/admin/clientes">Limpiar</Link>
    </form>
    <section className="admin-panel admin-table-wrap">{page.items.length === 0 ? <div className="empty-state empty-state--small"><h2>No hay resultados</h2><p>Probá modificando los filtros.</p></div> : <table className="admin-table"><thead><tr><th>Cliente</th><th>Contacto</th><th>Registro</th><th>Pedidos</th><th>Estado</th><th>Actualizado</th><th></th></tr></thead><tbody>{page.items.map((customer) => <tr key={customer.id}><td><strong>{customer.firstName} {customer.lastName}</strong><small>{customer.email}</small></td><td>{customer.phone}</td><td>{customer.createdAt.toLocaleDateString("es-AR")}</td><td>{customer.orderCount}</td><td><span className={`status-badge status-badge--${customer.status.toLowerCase()}`}>{customer.status === "ACTIVE" ? "ACTIVO" : "DESHABILITADO"}</span></td><td>{customer.updatedAt.toLocaleDateString("es-AR")}</td><td><Link href={`/admin/clientes/${customer.id}`}>Ver</Link></td></tr>)}</tbody></table>}</section>
    <nav className="pagination" aria-label="Paginación"><Link aria-disabled={page.page <= 1} href={adminPageHref("/admin/clientes", parameters, page.page - 1)}>← Anterior</Link><span>Página {page.page} de {page.pageCount}</span><Link aria-disabled={page.page >= page.pageCount} href={adminPageHref("/admin/clientes", parameters, page.page + 1)}>Siguiente →</Link></nav>
  </>;
}
