import Link from "next/link";
import { requireAdmin } from "@/modules/auth/presentation/session";
import { getOrderQueryService } from "@/modules/orders/infrastructure/order-composition";
import { formatMoney } from "@/shared/domain/money";

export const dynamic = "force-dynamic";
export default async function AdminOrdersPage() {
  await requireAdmin("orders.read");
  const orders = await getOrderQueryService().listAdmin();
  return <><div className="admin-heading"><div><p className="eyebrow">Ventas</p><h1>Pedidos</h1><p>Vista operativa inicial de pedidos y reservas pendientes.</p></div></div>
    <section className="admin-panel admin-table-wrap">{orders.length === 0 ? <div className="empty-state empty-state--small"><h2>Sin pedidos</h2><p>Los pedidos confirmados aparecerán aquí.</p></div> : <table className="admin-table"><thead><tr><th>Número</th><th>Comprador</th><th>Fecha</th><th>Estado</th><th>Subtotal</th><th>Envío</th><th>Total</th><th></th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><strong>#{order.number.toString()}</strong></td><td><strong>{order.buyerName}</strong><small>{order.buyerEmail} · {order.customerId ? "Cliente" : "Invitado"}</small></td><td>{order.createdAt.toLocaleString("es-AR")}</td><td><span className="status-badge status-badge--inactive">{order.status}</span></td><td>{formatMoney(order.itemsSubtotalInCents)}</td><td>{formatMoney(order.shippingAmountInCents)}</td><td><strong>{formatMoney(order.totalInCents)}</strong></td><td><Link href={`/admin/pedidos/${order.id}`}>Ver</Link></td></tr>)}</tbody></table>}</section>
  </>;
}
