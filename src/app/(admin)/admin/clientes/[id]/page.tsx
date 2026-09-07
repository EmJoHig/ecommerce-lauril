import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/modules/auth/presentation/session";
import { getCustomerAdminService } from "@/modules/customers/infrastructure/customer-admin-composition";
import { CustomerAdminProfileForm, CustomerNoteForm, CustomerStatusForm } from "@/modules/customers/presentation/customer-admin-forms";
import { orderStatusClass, orderStatusLabel } from "@/modules/orders/presentation/order-presenter";
import { NotFoundError } from "@/shared/domain/errors";
import { formatMoney } from "@/shared/domain/money";

export const dynamic = "force-dynamic";

export default async function AdminCustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin("customers.read");
  const { id } = await params;
  let customer;
  try { customer = await getCustomerAdminService().find(id); }
  catch (error) { if (error instanceof NotFoundError) notFound(); throw error; }
  return <>
    <div className="admin-heading"><div><p className="eyebrow">Clientes</p><h1>{customer.firstName} {customer.lastName}</h1><p>{customer.email} · email inmutable</p></div><Link className="button button--secondary" href="/admin/clientes">Volver</Link></div>
    <div className="admin-detail-grid">
      <section className="admin-panel"><div className="panel-heading"><div><p className="eyebrow">Datos</p><h2>Perfil comercial</h2></div><span className={`status-badge status-badge--${customer.status.toLowerCase()}`}>{customer.status}</span></div>
        <dl className="detail-list"><dt>Email</dt><dd>{customer.email}</dd><dt>Registro</dt><dd>{customer.createdAt.toLocaleString("es-AR")}</dd><dt>Última actualización</dt><dd>{customer.updatedAt.toLocaleString("es-AR")}</dd></dl>
        <CustomerAdminProfileForm customerId={customer.id} document={customer.document} firstName={customer.firstName} lastName={customer.lastName} phone={customer.phone} />
        <CustomerStatusForm customerId={customer.id} status={customer.status} />
      </section>
      <section className="admin-panel"><div className="panel-heading"><div><p className="eyebrow">Direcciones</p><h2>{customer.addresses.length} guardadas</h2></div></div>{customer.addresses.length ? <div className="address-admin-list">{customer.addresses.map((address) => <article key={address.id}><div><strong>{address.label}</strong>{address.isDefault ? <span className="status-badge status-badge--active">Predeterminada</span> : null}</div><p>{address.recipientFirstName} {address.recipientLastName} · {address.phone}</p><p>{address.street} {address.streetNumber}{address.floorApartment ? `, ${address.floorApartment}` : ""}</p><p>{address.city}, {address.province} ({address.postalCode})</p>{address.references ? <small>{address.references}</small> : null}</article>)}</div> : <div className="empty-state empty-state--small"><p>El cliente no guardó direcciones.</p></div>}</section>
    </div>
    <section className="admin-panel admin-table-wrap"><div className="panel-heading"><div><p className="eyebrow">Ventas</p><h2>Pedidos relacionados</h2></div></div>{customer.orders.length ? <table className="admin-table"><thead><tr><th>Número</th><th>Fecha</th><th>Estado</th><th>Entrega</th><th>Total</th><th></th></tr></thead><tbody>{customer.orders.map((order) => <tr key={order.id}><td><strong>#{order.number.toString()}</strong></td><td>{order.createdAt.toLocaleString("es-AR")}</td><td><span className={`status-badge status-badge--${orderStatusClass(order.status)}`}>{orderStatusLabel(order.status)}</span></td><td>{order.shippingMethodName}</td><td>{formatMoney(order.totalInCents)}</td><td><Link href={`/admin/pedidos/${order.id}`}>Abrir pedido</Link></td></tr>)}</tbody></table> : <div className="empty-state empty-state--small"><p>Todavía no tiene pedidos.</p></div>}</section>
    <section className="admin-panel"><div className="panel-heading"><div><p className="eyebrow">Privado</p><h2>Notas internas</h2></div></div><CustomerNoteForm customerId={customer.id} />{customer.notes.length ? <div className="internal-note-list">{customer.notes.map((note) => <article key={note.id}><p>{note.content}</p><small>{note.actorName} ({note.actorEmail}) · {note.createdAt.toLocaleString("es-AR")}</small></article>)}</div> : <div className="empty-state empty-state--small"><p>No hay notas internas.</p></div>}</section>
  </>;
}
