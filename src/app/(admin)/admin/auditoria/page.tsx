import Link from "next/link";
import { requireAdmin } from "@/modules/auth/presentation/session";
import { getAuditService } from "@/modules/audit/infrastructure/audit-composition";
import { DomainError } from "@/shared/domain/errors";
import { adminPageHref, pageParam, textParam, type AdminSearchParams } from "@/shared/presentation/admin-search-params";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<AdminSearchParams> }) {
  await requireAdmin("audit.read");
  const parameters = await searchParams;
  const service = getAuditService();
  const facets = await service.listFacets();
  let error = "";
  let page;
  try {
    page = await service.list({
      page: pageParam(parameters.page), search: textParam(parameters.buscar), action: textParam(parameters.accion),
      entityType: textParam(parameters.entidad), createdFrom: textParam(parameters.desde), createdTo: textParam(parameters.hasta),
    });
  } catch (caught) {
    error = caught instanceof DomainError ? caught.message : "Los filtros no son válidos.";
    page = await service.list({});
  }
  return <>
    <div className="admin-heading"><div><p className="eyebrow">Seguridad</p><h1>Auditoría</h1><p>{page.total} eventos de solo lectura.</p></div></div>
    {error ? <div className="form-error" role="alert">{error}</div> : null}
    <form className="admin-filters"><input defaultValue={textParam(parameters.buscar)} name="buscar" placeholder="Actor, entidad o identificador" /><select defaultValue={textParam(parameters.accion)} name="accion"><option value="">Todas las acciones</option>{facets.actions.map((action) => <option key={action} value={action}>{action}</option>)}</select><select defaultValue={textParam(parameters.entidad)} name="entidad"><option value="">Todas las entidades</option>{facets.entityTypes.map((entity) => <option key={entity} value={entity}>{entity}</option>)}</select><label className="filter-date">Desde<input defaultValue={textParam(parameters.desde)} name="desde" type="date" /></label><label className="filter-date">Hasta<input defaultValue={textParam(parameters.hasta)} name="hasta" type="date" /></label><button className="button button--dark" type="submit">Aplicar</button><Link className="button button--secondary" href="/admin/auditoria">Limpiar</Link></form>
    <section className="admin-panel admin-table-wrap">{page.items.length ? <table className="admin-table"><thead><tr><th>Fecha</th><th>Actor</th><th>Acción</th><th>Entidad</th><th>Contexto seguro</th></tr></thead><tbody>{page.items.map((entry) => <tr key={entry.id}><td>{entry.createdAt.toLocaleString("es-AR")}</td><td><strong>{entry.actorName}</strong>{entry.actorEmail ? <small>{entry.actorEmail}</small> : null}</td><td><code>{entry.action}</code></td><td><strong>{entry.entityType}</strong><small>{entry.entityId ?? "—"}</small></td><td><pre className="audit-metadata">{entry.metadata ? JSON.stringify(entry.metadata, null, 2) : "—"}</pre></td></tr>)}</tbody></table> : <div className="empty-state empty-state--small"><h2>No hay eventos</h2></div>}</section>
    <nav className="pagination" aria-label="Paginación"><Link aria-disabled={page.page <= 1} href={adminPageHref("/admin/auditoria", parameters, page.page - 1)}>← Anterior</Link><span>Página {page.page} de {page.pageCount}</span><Link aria-disabled={page.page >= page.pageCount} href={adminPageHref("/admin/auditoria", parameters, page.page + 1)}>Siguiente →</Link></nav>
  </>;
}
