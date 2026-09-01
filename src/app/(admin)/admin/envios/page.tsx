import Link from "next/link";
import { requireAdmin } from "@/modules/auth/presentation/session";
import { getShippingAdminService } from "@/modules/shipping/infrastructure/shipping-composition";
import { setShippingMethodActiveAction } from "@/modules/shipping/presentation/shipping-actions";
import { formatMoney } from "@/shared/domain/money";

export const dynamic = "force-dynamic";
export default async function ShippingMethodsPage() {
  await requireAdmin("shipping.read");
  const methods = await getShippingAdminService().list();
  return <><div className="admin-heading"><div><p className="eyebrow">Ventas</p><h1>Métodos de entrega</h1><p>Configurá costos, umbrales y disponibilidad del checkout.</p></div><Link className="button button--dark" href="/admin/envios/nuevo">Nuevo método</Link></div>
    <section className="admin-panel admin-table-wrap">{methods.length === 0 ? <div className="empty-state empty-state--small"><h2>Sin métodos</h2></div> : <table className="admin-table"><thead><tr><th>Nombre</th><th>Tipo</th><th>Costo</th><th>Gratis desde</th><th>Orden</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{methods.map((method) => <tr key={method.id}><td><strong>{method.name}</strong><small>{method.code}</small></td><td>{method.type}</td><td>{formatMoney(method.costInCents)}</td><td>{method.freeShippingFromInCents === null ? "—" : formatMoney(method.freeShippingFromInCents)}</td><td>{method.sortOrder}</td><td><span className={`status-badge status-badge--${method.isActive ? "active" : "inactive"}`}>{method.isActive ? "ACTIVO" : "INACTIVO"}</span></td><td><div className="table-actions"><Link href={`/admin/envios/${method.id}/editar`}>Editar</Link><form action={setShippingMethodActiveAction}><input name="id" type="hidden" value={method.id} /><input name="active" type="hidden" value={String(!method.isActive)} /><button type="submit">{method.isActive ? "Desactivar" : "Activar"}</button></form></div></td></tr>)}</tbody></table>}</section>
  </>;
}
