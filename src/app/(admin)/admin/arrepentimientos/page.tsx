import Link from "next/link";
import { requireAdmin } from "@/modules/auth/presentation/session";
import { getWithdrawalAdminService } from "@/modules/withdrawal/infrastructure/withdrawal-admin-composition";
import { withdrawalAge, withdrawalLabels, withdrawalStatuses } from "@/modules/withdrawal/domain/withdrawal-admin";

export const dynamic = "force-dynamic";
export default async function WithdrawalsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin("admin.access");
  await requireAdmin("withdrawals.read");
  const params = await searchParams;
  const search = typeof params.buscar === "string" ? params.buscar : "";
  const status = typeof params.estado === "string" && withdrawalStatuses.includes(params.estado as typeof withdrawalStatuses[number]) ? params.estado : "";
  const page = Math.max(1, Math.min(100000, Number.isSafeInteger(Number(params.page)) ? Number(params.page) : 1));
  const result = await getWithdrawalAdminService().list({ search, status, page });
  const href = (next: number) => `/admin/arrepentimientos?${new URLSearchParams({ buscar: search, estado: status, page: String(next) })}`;
  return <>
    <div className="admin-heading"><div><p className="eyebrow">Atención al consumidor</p><h1 style={{ overflowWrap: "anywhere" }}>Arrepentimientos</h1><p>Prioridad para solicitudes no resueltas, de más antiguas a más recientes.</p></div></div>
    <section className="metric-grid"><article><span>Pendientes</span><strong>{result.pending}</strong></article><article><span>En gestión</span><strong>{result.inProgress}</strong></article></section>
    <p>La antigüedad incluye domingos y feriados. Revisá esta sección al menos dos veces al día, también fuera del horario comercial.</p>
    <form className="admin-filters"><input name="buscar" aria-label="Código ARR o número de pedido" placeholder="Código ARR completo o número de pedido" defaultValue={search} maxLength={100} /><select name="estado" aria-label="Estado" defaultValue={status}><option value="">Todos los estados</option>{withdrawalStatuses.map((value) => <option key={value} value={value}>{withdrawalLabels[value]}</option>)}</select><button className="button button--dark">Aplicar</button><Link href="/admin/arrepentimientos">Limpiar</Link></form>
    <section className="admin-panel admin-table-wrap"><table className="admin-table"><thead><tr><th>Solicitud</th><th>Pedido</th><th>Recepción</th><th>Antigüedad calendario</th><th>Estado</th><th></th></tr></thead><tbody>{result.items.map((item) => <tr key={item.id}><td>{item.code}</td><td>{item.orderNumber?.toString() ?? "Sin número"}</td><td>{item.createdAt.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}</td><td>{withdrawalAge(item.createdAt)}</td><td>{withdrawalLabels[item.status]}</td><td><Link href={`/admin/arrepentimientos/${item.id}`}>Ver solicitud</Link></td></tr>)}</tbody></table>{!result.items.length ? <p>No hay solicitudes para estos filtros.</p> : null}</section>
    <nav className="pagination" aria-label="Paginación">{page > 1 ? <Link href={href(page - 1)}>Anterior</Link> : <span>Anterior</span>}<span>Página {page} · {result.total} solicitudes</span>{page * 20 < result.total ? <Link href={href(page + 1)}>Siguiente</Link> : <span>Siguiente</span>}</nav>
  </>;
}
