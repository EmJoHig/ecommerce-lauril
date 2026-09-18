import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentCustomer } from "@/modules/customers/presentation/customer-session";
import { getOrderQueryService } from "@/modules/orders/infrastructure/order-composition";
import { getGuestOrderTokenHash } from "@/modules/orders/presentation/guest-order-cookie";
import { NotFoundError } from "@/shared/domain/errors";
import { formatMoney } from "@/shared/domain/money";
import { orderStatusClass, orderStatusLabel } from "@/modules/orders/presentation/order-presenter";
import { isMercadoPagoCheckoutAvailable } from "@/modules/payments/infrastructure/payment-composition";
import { startPaymentCheckoutAction } from "@/modules/payments/presentation/payment-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pedido", robots: { index: false, follow: false } };

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ number: string }>;
  searchParams: Promise<{ payment_return?: string | string[]; payment_error?: string | string[] }>;
}) {
  const { number } = await params;
  const query = await searchParams;
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
  const paymentReturn = typeof query.payment_return === "string" && ["success", "failure", "pending"].includes(query.payment_return);
  const paymentError = query.payment_error === "unavailable";
  const reservationActive = order.status === "PENDING_PAYMENT"
    && order.reservationReleasedAt === null
    && order.paymentExpiresAt > new Date();
  const paymentAvailable = reservationActive && isMercadoPagoCheckoutAvailable();
  const paymentAction = startPaymentCheckoutAction.bind(null, order.number.toString());
  return <section className="order-page section">
      <div className="order-hero"><p className="eyebrow">Detalle del pedido</p><h1>Pedido #{order.number.toString()}</h1><span className={`status-badge status-badge--${orderStatusClass(order.status)}`}>{orderStatusLabel(order.status)}</span><p>{reservationActive ? `Reservamos temporalmente tus productos hasta ${order.paymentExpiresAt.toLocaleString("es-AR")}.` : "La reserva de este pedido ya no está activa."}</p>{paymentReturn ? <p role="status">Volviste de Mercado Pago. Estamos verificando la acreditación del pago.</p> : null}{paymentError ? <p role="alert">No pudimos iniciar el pago. Volvé a intentarlo más tarde.</p> : null}</div>
      <div className="order-layout">
        <section className="checkout-card"><h2>Productos</h2>{order.items.map((item) => <div className="order-line" key={item.sku}><span><strong>{item.productName}</strong><small>{item.variantName} · SKU {item.sku} · {item.quantity} unidad(es)</small></span><strong>{formatMoney(item.subtotalInCents)}</strong></div>)}</section>
        <aside className="cart-summary"><div><span>Subtotal</span><strong>{formatMoney(order.itemsSubtotalInCents)}</strong></div><div><span>{order.shippingMethodName}</span><strong>{formatMoney(order.shippingAmountInCents)}</strong></div><div className="cart-summary__total"><span>Total</span><strong>{formatMoney(order.totalInCents)}</strong></div>{paymentAvailable ? <form action={paymentAction}><button className="button button--primary" type="submit">Pagar con Mercado Pago</button></form> : null}</aside>
      </div>
      <div className="order-navigation">{customer ? <Link className="button button--secondary" href="/mi-cuenta/pedidos">Volver a mis pedidos</Link> : null}<Link className="button button--secondary" href="/productos">Seguir comprando</Link></div>
    </section>;
}
