import Link from "next/link";
import { requireCustomer } from "@/modules/customers/presentation/customer-session";
import { getCustomerService } from "@/modules/customers/infrastructure/customer-composition";
import { getOrderQueryService } from "@/modules/orders/infrastructure/order-composition";
import { orderStatusLabel } from "@/modules/orders/presentation/order-presenter";
import { formatMoney } from "@/shared/domain/money";

export default async function CustomerAccountPage({ searchParams }: { searchParams: Promise<{ carrito?: string }> }) {
  const customer = await requireCustomer();
  const [addresses, orders] = await Promise.all([
    getCustomerService().listAddresses(customer.id),
    getOrderQueryService().listCustomer(customer.id),
  ]);
  const { carrito } = await searchParams;
  return (
    <div className="account-dashboard">
      {carrito === "fusionado" ? <div className="form-success">Tu carrito invitado se fusionó con tu cuenta.</div> : null}
      {carrito?.startsWith("ajustado-") ? <div className="cart-warning">Fusionamos el carrito y ajustamos artículos según disponibilidad actual.</div> : null}
      {carrito === "pendiente" ? <div className="cart-warning">Ingresaste correctamente, pero el carrito no pudo fusionarse. Conservamos el carrito invitado para reintentar.</div> : null}
      <div className="account-card"><p className="eyebrow">Datos personales</p><h2>{customer.firstName} {customer.lastName}</h2><p>{customer.phone}</p><Link href="/mi-cuenta/datos">Editar datos</Link></div>
      <div className="account-card"><p className="eyebrow">Direcciones</p><h2>{addresses.length === 0 ? "Todavía no agregaste direcciones" : `${addresses.length} ${addresses.length === 1 ? "dirección" : "direcciones"}`}</h2><p>{addresses.find((address) => address.isDefault)?.label ?? "Podés agregar una dirección para usar más adelante."}</p><Link href="/mi-cuenta/direcciones">Administrar direcciones</Link></div>
      <div className="account-card"><p className="eyebrow">Pedidos</p><h2>{orders.length === 0 ? "Todavía no hiciste pedidos" : `${orders.length} ${orders.length === 1 ? "pedido" : "pedidos"}`}</h2><p>{orders[0] ? `Último: #${orders[0].number.toString()} · ${orderStatusLabel(orders[0].status)} · ${formatMoney(orders[0].totalInCents)}` : "Cuando confirmes una compra, vas a encontrarla acá."}</p><Link href="/mi-cuenta/pedidos">Ver mis pedidos</Link></div>
    </div>
  );
}
