import type { Metadata } from "next";
import Link from "next/link";
import { requireCustomer } from "@/modules/customers/presentation/customer-session";
import { getOrderQueryService } from "@/modules/orders/infrastructure/order-composition";
import { orderStatusClass, orderStatusLabel } from "@/modules/orders/presentation/order-presenter";
import { formatMoney } from "@/shared/domain/money";

export const metadata: Metadata = { title: "Mis pedidos", robots: { index: false, follow: false } };

export default async function CustomerOrdersPage() {
  const customer = await requireCustomer();
  const orders = await getOrderQueryService().listCustomer(customer.id);

  return <div>
    <div className="account-section-heading"><h2>Mis pedidos</h2><p>Consultá el estado y el detalle de tus compras.</p></div>
    {orders.length === 0 ? <div className="empty-state account-empty-state"><h2>Todavía no hiciste pedidos</h2><p>Explorá el catálogo y confirmá tu primera compra.</p><Link className="button button--dark" href="/productos">Ver productos</Link></div> : <div className="customer-order-list">
      {orders.map((order) => <article className="customer-order-card" key={order.id}>
        <div><p className="eyebrow">Pedido #{order.number.toString()}</p><h3>{order.createdAt.toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" })}</h3><p>{order.itemCount} {order.itemCount === 1 ? "ítem" : "ítems"} · {formatMoney(order.totalInCents)}</p></div>
        <div className="customer-order-card__actions"><span className={`status-badge status-badge--${orderStatusClass(order.status)}`}>{orderStatusLabel(order.status)}</span><Link className="button button--secondary" href={`/pedido/${order.number.toString()}`}>Ver detalle</Link></div>
      </article>)}
    </div>}
  </div>;
}
