import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/modules/auth/presentation/session";
import { getOrderAdminService } from "@/modules/orders/infrastructure/order-composition";
import { OrderNoteForm, OrderTransitionForm } from "@/modules/orders/presentation/order-admin-forms";
import { orderStatusClass, orderStatusLabel, transitionLabel } from "@/modules/orders/presentation/order-presenter";
import { NotFoundError } from "@/shared/domain/errors";
import { formatMoney } from "@/shared/domain/money";

export const dynamic = "force-dynamic";

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin("orders.read");
  let order;
  try {
    order = await getOrderAdminService().find((await params).id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const canWrite = admin.permissions.includes("orders.write");
  const pickup = order.shippingMethodType === "PICKUP";
  return <>
    <div className="admin-heading"><div><p className="eyebrow">Ventas</p><h1>Pedido #{order.number.toString()}</h1><p>{order.buyerFirstName} {order.buyerLastName} · {order.customerId ? "Cliente registrado" : "Invitado"}</p></div><Link className="button button--secondary" href="/admin/pedidos">Volver</Link></div>
    <div className="order-admin-summary">
      <section className="admin-panel form-section"><h2>Datos generales</h2><dl className="order-data-list"><div><dt>Estado</dt><dd><span className={`status-badge status-badge--${orderStatusClass(order.status)}`}>{orderStatusLabel(order.status)}</span></dd></div><div><dt>Creado</dt><dd>{order.createdAt.toLocaleString("es-AR")}</dd></div><div><dt>Vencimiento de pago</dt><dd>{order.paymentExpiresAt.toLocaleString("es-AR")}</dd></div><div><dt>Reserva liberada</dt><dd>{order.reservationReleasedAt ? order.reservationReleasedAt.toLocaleString("es-AR") : "No"}</dd></div></dl></section>
      <section className="admin-panel form-section"><h2>Comprador</h2><dl className="order-data-list"><div><dt>Nombre</dt><dd>{order.buyerFirstName} {order.buyerLastName}</dd></div><div><dt>Email</dt><dd>{order.buyerEmail}</dd></div><div><dt>Teléfono</dt><dd>{order.buyerPhone}</dd></div><div><dt>Tipo</dt><dd>{order.customerId ? `Cliente · ${order.customerId}` : "Invitado"}</dd></div></dl></section>
      <section className="admin-panel form-section"><h2>Entrega</h2><p><strong>{order.shippingMethodName}</strong> · {order.shippingMethodType}</p>{order.shippingRequiresAddress ? <address><strong>{order.shippingRecipientFirstName} {order.shippingRecipientLastName}</strong><br />{order.shippingStreet} {order.shippingStreetNumber}{order.shippingFloorApartment ? `, ${order.shippingFloorApartment}` : ""}<br />{order.shippingCity}, {order.shippingProvince} ({order.shippingPostalCode})<br />{order.shippingPhone}{order.shippingReferences ? <><br />Referencias: {order.shippingReferences}</> : null}</address> : <p>No requiere dirección de envío.</p>}<p>Costo: <strong>{formatMoney(order.shippingAmountInCents)}</strong></p></section>
    </div>
    <div className="admin-grid">
      <section className="admin-panel form-section"><h2>Productos</h2>{order.items.map((item) => <div className="order-line" key={item.id}><span><strong>{item.productName}</strong><small>{item.variantName} · SKU {item.sku}</small><small>{formatMoney(item.unitPriceInCents)} × {item.quantity}</small></span><strong>{formatMoney(item.subtotalInCents)}</strong></div>)}</section>
      <aside className="admin-panel form-section"><h2>Totales</h2><dl className="order-totals"><div><dt>Subtotal</dt><dd>{formatMoney(order.itemsSubtotalInCents)}</dd></div><div><dt>Descuentos</dt><dd>{formatMoney(order.discountAmountInCents)}</dd></div><div><dt>Envío</dt><dd>{formatMoney(order.shippingAmountInCents)}</dd></div><div><dt>Total</dt><dd><strong>{formatMoney(order.totalInCents)}</strong></dd></div></dl></aside>
    </div>
    {canWrite ? <section className="admin-panel form-section order-operations"><h2>Operación</h2>{order.allowedTransitions.length === 0 ? <p>No hay transiciones administrativas disponibles para este estado.</p> : order.allowedTransitions.map((status) => <OrderTransitionForm critical={status === "CANCELLED"} key={status} label={transitionLabel(status, pickup)} orderId={order.id} toStatus={status} />)}<p className="form-help">El estado Pagado está reservado para la futura integración de pagos y no puede asignarse desde este panel.</p></section> : null}
    <div className="admin-grid order-admin-bottom">
      <section className="admin-panel form-section"><h2>Historial</h2><ol className="order-timeline">{order.history.map((entry) => <li key={entry.id}><span className={`status-badge status-badge--${orderStatusClass(entry.toStatus)}`}>{orderStatusLabel(entry.toStatus)}</span><div><strong>{entry.fromStatus ? `${orderStatusLabel(entry.fromStatus)} → ${orderStatusLabel(entry.toStatus)}` : orderStatusLabel(entry.toStatus)}</strong><p>{entry.reason}</p><small>{entry.createdAt.toLocaleString("es-AR")} · {entry.actorName ? `${entry.actorName} (${entry.actorEmail})` : "Sistema"}</small></div></li>)}</ol></section>
      <section className="admin-panel form-section"><h2>Notas internas</h2>{canWrite ? <OrderNoteForm orderId={order.id} /> : null}<div className="order-notes">{order.notes.length === 0 ? <p className="form-help">Todavía no hay notas internas.</p> : order.notes.map((note) => <article key={note.id}><p>{note.content}</p><small>{note.actorName} · {note.createdAt.toLocaleString("es-AR")}</small></article>)}</div></section>
    </div>
  </>;
}
