import Link from "next/link";
import { CartIndicator } from "@/modules/cart/presentation/cart-indicator";

export default function StoreLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="store-shell">
      <div className="announcement">Envíos a todo el país · Compra segura</div>
      <header className="store-header">
        <Link className="brand" href="/" aria-label="Lauril, inicio">
          <span className="brand__mark">L</span>
          <span>Lauril</span>
        </Link>
        <nav aria-label="Navegación principal">
          <Link href="/productos">Tienda</Link>
          <Link href="/#colecciones">Colecciones</Link>
          <Link href="/#historia">Nuestra historia</Link>
        </nav>
        <div className="store-header__actions">
          <Link href="/productos">Buscar</Link>
          <CartIndicator />
        </div>
      </header>
      <main>{children}</main>
      <footer className="store-footer">
        <div>
          <p className="brand brand--footer"><span className="brand__mark">L</span> Lauril</p>
          <p>Diseñado con calma. Elegido para durar.</p>
        </div>
        <div>
          <strong>Tienda</strong>
          <Link href="/productos">Todos los productos</Link>
          <span>Preguntas frecuentes</span>
        </div>
        <div>
          <strong>Contacto</strong>
          <span>Buenos Aires, Argentina</span>
          <span>hola@lauril.com.ar</span>
        </div>
      </footer>
    </div>
  );
}
