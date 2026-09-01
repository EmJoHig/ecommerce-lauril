import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentCustomer } from "@/modules/customers/presentation/customer-session";
import { getOrderQueryService } from "@/modules/orders/infrastructure/order-composition";
import { getGuestOrderTokenHash } from "@/modules/orders/presentation/guest-order-cookie";
import { NotFoundError } from "@/shared/domain/errors";
import { formatMoney } from "@/shared/domain/money";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pedido", robots: { index: false, follow: false } };

export default async function OrderPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const customer = await getCurrentCustomer();
  let order;
  try {
    order = await getOrderQueryService().findPublic(number, {
      customerId: customer?.id ?? null,
      guestTokenHash: customer ? null : await getGuestOrderTokenHash(number),
    });
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  return <section className="order-page section">
      <div className="order-hero"><p className="eyebrow">Pedido confirmado</p><h1>Pedido #{order.number.toString()}</h1><span className="status-badge status-badge--inactive">{order.status.replaceAll("_", " ")}</span><p>{order.status === "PENDING_PAYMENT" ? `Reservamos temporalmente tus productos hasta ${order.paymentExpiresAt.toLocaleString("es-AR")}.` : "La reserva de este pedido ya no está activa."}</p></div>
      <div className="order-layout">
        <section className="checkout-card"><h2>Productos</h2>{order.items.map((item) => <div className="order-line" key={item.sku}><span><strong>{item.productName}</strong><small>{item.variantName} · SKU {item.sku} · {item.quantity} unidad(es)</small></span><strong>{formatMoney(item.subtotalInCents)}</strong></div>)}</section>
        <aside className="cart-summary"><div><span>Subtotal</span><strong>{formatMoney(order.itemsSubtotalInCents)}</strong></div><div><span>{order.shippingMethodName}</span><strong>{formatMoney(order.shippingAmountInCents)}</strong></div><div className="cart-summary__total"><span>Total</span><strong>{formatMoney(order.totalInCents)}</strong></div><p>La integración de pago se habilitará en la siguiente fase.</p></aside>
      </div>
      <Link className="button button--secondary" href="/productos">Volver a la tienda</Link>
    </section>;
}
