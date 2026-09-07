import Link from "next/link";
import { CartIndicator } from "@/modules/cart/presentation/cart-indicator";
import { getCurrentCustomer } from "@/modules/customers/presentation/customer-session";
import { logoutCustomerAction } from "@/modules/customers/presentation/customer-actions";
import { getPublicStoreSettings } from "@/modules/store-settings/infrastructure/store-settings-composition";

export default async function StoreLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [customer, settings] = await Promise.all([getCurrentCustomer(), getPublicStoreSettings()]);
  const brandMark = settings.storeName.charAt(0).toUpperCase();
  return (
    <div className="store-shell">
      <div className="announcement">Envíos a todo el país · Compra segura</div>
      <header className="store-header">
        <Link className="brand" href="/" aria-label={`${settings.storeName}, inicio`}>
          <span className="brand__mark">{brandMark}</span>
          <span>{settings.storeName}</span>
        </Link>
        <nav aria-label="Navegación principal">
          <Link href="/productos">Tienda</Link>
          <Link href="/#colecciones">Colecciones</Link>
          <Link href="/#historia">Nuestra historia</Link>
        </nav>
        <div className="store-header__actions">
          <Link href="/productos#buscar">Buscar</Link>
          {customer ? <><Link href="/mi-cuenta">Mi cuenta</Link><form action={logoutCustomerAction}><button type="submit">Cerrar sesión</button></form></> : <><Link href="/login">Ingresar</Link><Link href="/registro">Crear cuenta</Link></>}
          <CartIndicator />
        </div>
      </header>
      <main>{children}</main>
      <footer className="store-footer">
        <div>
          <p className="brand brand--footer"><span className="brand__mark">{brandMark}</span> {settings.storeName}</p>
          {settings.publicDescription ? <p>{settings.publicDescription}</p> : null}
        </div>
        <div>
          <strong>Tienda</strong>
          <Link href="/productos">Todos los productos</Link>
          <span>Preguntas frecuentes</span>
        </div>
        <div>
          <strong>Contacto</strong>
          {settings.businessAddress ? <span>{settings.businessAddress}</span> : null}
          <a href={`mailto:${settings.publicEmail}`}>{settings.publicEmail}</a>
          {settings.phone ? <a href={`tel:${settings.phone}`}>{settings.phone}</a> : null}
          {settings.whatsapp ? <a href={`https://wa.me/${settings.whatsapp.replace(/\D/g, "")}`}>WhatsApp</a> : null}
          {settings.instagramUrl ? <a href={settings.instagramUrl} rel="noreferrer" target="_blank">Instagram</a> : null}
          {settings.facebookUrl ? <a href={settings.facebookUrl} rel="noreferrer" target="_blank">Facebook</a> : null}
        </div>
      </footer>
    </div>
  );
}
