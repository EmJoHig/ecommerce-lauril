import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/modules/auth/presentation/session";
import { getOrderQueryService } from "@/modules/orders/infrastructure/order-composition";
import { NotFoundError } from "@/shared/domain/errors";
import { formatMoney } from "@/shared/domain/money";

export const dynamic = "force-dynamic";
export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin("orders.read");
  let order;
  try {
    order = await getOrderQueryService().findAdmin((await params).id);
  } catch (error) { if (error instanceof NotFoundError) notFound(); throw error; }
  return <><div className="admin-heading"><div><p className="eyebrow">Ventas</p><h1>Pedido #{order.number.toString()}</h1><p>{order.buyerFirstName} {order.buyerLastName} · {order.buyerEmail}</p></div><Link className="button button--secondary" href="/admin/pedidos">Volver</Link></div>
      <div className="admin-grid"><section className="admin-panel form-section"><h2>Detalle</h2>{order.items.map((item) => <div className="order-line" key={item.sku}><span><strong>{item.productName}</strong><small>{item.variantName} · SKU {item.sku} · {item.quantity} unidad(es)</small></span><strong>{formatMoney(item.subtotalInCents)}</strong></div>)}</section><aside className="admin-panel form-section"><h2>Resumen</h2><p>Estado: <strong>{order.status}</strong></p><p>Expira: {order.paymentExpiresAt.toLocaleString("es-AR")}</p><p>Entrega: {order.shippingMethodName}</p><p>Subtotal: {formatMoney(order.itemsSubtotalInCents)}</p><p>Envío: {formatMoney(order.shippingAmountInCents)}</p><p>Total: <strong>{formatMoney(order.totalInCents)}</strong></p></aside></div>
      <section className="admin-panel form-section"><h2>Historial</h2>{order.history.map((entry) => <p key={`${entry.createdAt.toISOString()}-${entry.toStatus}`}><strong>{entry.toStatus}</strong> · {entry.reason} · {entry.createdAt.toLocaleString("es-AR")}</p>)}</section>
    </>;
}
