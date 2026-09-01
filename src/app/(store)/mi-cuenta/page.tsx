import Link from "next/link";
import { requireCustomer } from "@/modules/customers/presentation/customer-session";
import { getCustomerService } from "@/modules/customers/infrastructure/customer-composition";

export default async function CustomerAccountPage({ searchParams }: { searchParams: Promise<{ carrito?: string }> }) {
  const customer = await requireCustomer();
  const addresses = await getCustomerService().listAddresses(customer.id);
  const { carrito } = await searchParams;
  return (
    <div className="account-dashboard">
      {carrito === "fusionado" ? <div className="form-success">Tu carrito invitado se fusionó con tu cuenta.</div> : null}
      {carrito?.startsWith("ajustado-") ? <div className="cart-warning">Fusionamos el carrito y ajustamos artículos según disponibilidad actual.</div> : null}
      {carrito === "pendiente" ? <div className="cart-warning">Ingresaste correctamente, pero el carrito no pudo fusionarse. Conservamos el carrito invitado para reintentar.</div> : null}
      <div className="account-card"><p className="eyebrow">Datos personales</p><h2>{customer.firstName} {customer.lastName}</h2><p>{customer.phone}</p><Link href="/mi-cuenta/datos">Editar datos</Link></div>
      <div className="account-card"><p className="eyebrow">Direcciones</p><h2>{addresses.length === 0 ? "Todavía no agregaste direcciones" : `${addresses.length} ${addresses.length === 1 ? "dirección" : "direcciones"}`}</h2><p>{addresses.find((address) => address.isDefault)?.label ?? "Podés agregar una dirección para usar más adelante."}</p><Link href="/mi-cuenta/direcciones">Administrar direcciones</Link></div>
      <div className="account-card account-card--muted"><p className="eyebrow">Pedidos</p><h2>Disponible en una fase posterior</h2><p>No mostramos historial ficticio hasta implementar pedidos reales.</p></div>
    </div>
  );
}
