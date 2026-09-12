import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { CartIndicator } from "@/modules/cart/presentation/cart-indicator";
import { getCatalogService } from "@/modules/catalog/infrastructure/catalog-composition";
import { HeaderSearch } from "@/modules/catalog/presentation/header-search";
import { getCurrentCustomer } from "@/modules/customers/presentation/customer-session";
import { logoutCustomerAction } from "@/modules/customers/presentation/customer-actions";
import { getPublicStoreSettings } from "@/modules/store-settings/infrastructure/store-settings-composition";
import { NavigationLoading } from "./navigation-loading";

export default async function StoreLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [customer, settings, searchProducts] = await Promise.all([
    getCurrentCustomer(),
    getPublicStoreSettings(),
    getCatalogService().listProducts({ limit: 100 }),
  ]);
  return (
    <div className="store-shell">
      <Suspense fallback={null}><NavigationLoading /></Suspense>
      <div className="announcement">
        <span><TruckIcon /> Envíos a todo el país</span>
        {/* <span><HeartIcon /> Productos que acompañan</span> */}
        {/* <span><CardIcon /> Múltiples medios de pago</span> */}
      </div>
      <header className="store-header">
        <Link className="brand" href="/" aria-label={`${settings.storeName}, inicio`}>
          <Image alt={settings.storeName} className="brand__logo" height={122} preload src="/brand/lauril-logo.png" width={128} />
        </Link>
        <nav aria-label="Navegación principal" className="store-nav">
          <Link href="/">Inicio</Link>
          <Link href="/productos">Productos</Link>
          <Link href="/#colecciones">Colecciones</Link>
        </nav>
        <div className="store-header__actions">
          <HeaderSearch products={searchProducts.map((product) => ({ name: product.name, slug: product.slug, imageUrl: product.imageUrl, imageAlt: product.imageAlt ?? product.name }))} />
          {customer ? <Link aria-label="Ir a mi cuenta" className="header-account" href="/mi-cuenta"><AccountIcon /><span>Mi cuenta</span></Link> : <Link aria-label="Ingresar a mi cuenta" className="header-account" href="/login"><AccountIcon /><span>Ingresar</span></Link>}
          <CartIndicator />
          <details className="store-mobile-nav"><summary aria-label="Abrir menú"><MenuIcon /></summary><nav aria-label="Navegación mobile"><Link href="/">Inicio</Link><Link href="/productos">Productos</Link><Link href="/#colecciones">Colecciones</Link>{customer ? <><Link href="/mi-cuenta">Mi cuenta</Link><form action={logoutCustomerAction}><button type="submit">Cerrar sesión</button></form></> : <><Link href="/login">Ingresar</Link><Link href="/registro">Crear cuenta</Link></>}</nav></details>
        </div>
      </header>
      <main>{children}</main>
      <section aria-label="Beneficios de comprar en Lauril" className="footer-benefits">
        <div><TruckIcon /><span><strong>TE LLEVAMOS TU PEDIDO</strong><small>Envíos dentro del caso Urbano</small></span></div>
        {/* <div><CardIcon /><span><strong>Múltiples medios de pago</strong><small>Compra simple y transparente</small></span></div> */}
        <div><ShieldIcon /><span><strong>Compra segura</strong><small>Tus datos siempre protegidos</small></span></div>
        <div><HeartIcon /><span><strong>Calidad Lauril</strong><small>Selección pensada para durar</small></span></div>
      </section>
      <footer className="store-footer">
        <div>
          <Link className="brand brand--footer" href="/" aria-label={`${settings.storeName}, inicio`}><Image alt={settings.storeName} className="brand__logo brand__logo--footer" height={122} src="/brand/lauril-logo.png" width={128} /></Link>
          {settings.publicDescription ? <p>{settings.publicDescription}</p> : null}
        </div>
        <div>
          <strong>Tienda</strong>
          <Link href="/productos">Todos los productos</Link>
        </div>
        <div>
          <strong>Información</strong>
          <span>Envíos</span>
          <span>Cambios y devoluciones</span>
          {settings.businessAddress ? <span>{settings.businessAddress}</span> : null}
          <a href={`mailto:${settings.publicEmail}`}>{settings.publicEmail}</a>
          {settings.phone ? <a href={`tel:${settings.phone}`}>{settings.phone}</a> : null}
          {settings.whatsapp ? <a href={`https://wa.me/${settings.whatsapp.replace(/\D/g, "")}`}>WhatsApp</a> : null}
          {settings.facebookUrl ? <a href={settings.facebookUrl} rel="noreferrer" target="_blank">Facebook</a> : null}
        </div>
        <a aria-label="Lauril en Instagram" className="footer-instagram" href="https://www.instagram.com/lauril.quimica" rel="noreferrer" target="_blank"><InstagramIcon /><span>Instagram</span></a>
      </footer>
      <div className="store-copyright"><span>© {new Date().getFullYear()} {settings.storeName}. Todos los derechos reservados.</span><span>Hecho con <HeartIcon /> en Argentina</span></div>
    </div>
  );
}

function AccountIcon() { return <svg aria-hidden="true" fill="none" height="21" viewBox="0 0 24 24" width="21"><circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.7"/><path d="M5 20c.6-4 3-6 7-6s6.4 2 7 6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7"/></svg>; }
function MenuIcon() { return <svg aria-hidden="true" fill="none" height="22" viewBox="0 0 24 24" width="22"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8"/></svg>; }
function TruckIcon() { return <svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7"/><circle cx="7" cy="18" r="2" stroke="currentColor" strokeWidth="1.7"/><circle cx="18" cy="18" r="2" stroke="currentColor" strokeWidth="1.7"/></svg>; }
function HeartIcon() { return <svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="M20.8 5.8c-2-2-5.2-1.8-7 .4L12 8.3l-1.8-2.1c-1.8-2.2-5-2.4-7-.4-2.1 2.1-2 5.5.1 7.5L12 21l8.7-7.7c2.2-2 2.2-5.4.1-7.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7"/></svg>; }
function CardIcon() { return <svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><rect height="15" rx="2" stroke="currentColor" strokeWidth="1.7" width="20" x="2" y="5"/><path d="M2 10h20M6 15h4" stroke="currentColor" strokeWidth="1.7"/></svg>; }
function ShieldIcon() { return <svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="M12 2.5c2.5 2 5.2 2.7 8 3v6.2c0 4.5-2.7 7.8-8 9.8-5.3-2-8-5.3-8-9.8V5.5c2.8-.3 5.5-1 8-3Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7"/><path d="m8.5 12 2.2 2.2 4.8-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7"/></svg>; }
function InstagramIcon() { return <svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><rect height="18" rx="5" stroke="currentColor" strokeWidth="1.8" width="18" x="3" y="3"/><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8"/><circle cx="17.5" cy="6.5" fill="currentColor" r="1"/></svg>; }
