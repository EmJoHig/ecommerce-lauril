import Link from "next/link";
import { logoutCustomerAction } from "@/modules/customers/presentation/customer-actions";
import { requireCustomer } from "@/modules/customers/presentation/customer-session";

export const dynamic = "force-dynamic";

export default async function CustomerAccountLayout({ children }: { children: React.ReactNode }) {
  const customer = await requireCustomer();
  return (
    <section className="account-shell section">
      <header className="account-heading"><p className="eyebrow">Mi cuenta</p><h1>Hola, {customer.firstName}</h1><p>{customer.email}</p></header>
      <div className="account-layout">
        <aside className="account-nav"><nav aria-label="Mi cuenta"><Link href="/mi-cuenta">Resumen</Link><Link href="/mi-cuenta/datos">Datos personales</Link><Link href="/mi-cuenta/direcciones">Direcciones</Link><span>Pedidos <small>próximamente</small></span></nav><form action={logoutCustomerAction}><button type="submit">Cerrar sesión</button></form></aside>
        <div className="account-content">{children}</div>
      </div>
    </section>
  );
}
