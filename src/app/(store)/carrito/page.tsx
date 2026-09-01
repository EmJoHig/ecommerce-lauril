import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { formatMoney } from "@/shared/domain/money";
import { getRequestCart } from "@/modules/cart/presentation/cart-query";
import {
  CartQuantityControl,
  ClearCartButton,
  RemoveCartItemButton,
} from "@/modules/cart/presentation/cart-controls";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Carrito",
  description: "Revisá los productos guardados en tu carrito Lauril.",
  robots: { index: false, follow: false },
};

export default async function CartPage() {
  const cart = await getRequestCart();
  if (cart.items.length === 0) {
    return (
      <section className="cart-page section">
        <div className="cart-heading">
          <p className="eyebrow">Tu selección</p>
          <h1>Tu bolsa está vacía</h1>
          <p>Explorá el catálogo y guardá los productos que quieras comprar.</p>
          <Link className="button button--dark" href="/productos">Ver productos</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="cart-page section">
      <div className="cart-heading">
        <p className="eyebrow">Tu selección</p>
        <h1>Carrito</h1>
        <p>{cart.itemCount} unidades guardadas en este navegador.</p>
      </div>
      {cart.hasIssues ? <div className="cart-warning" role="alert"><strong>Revisá el carrito.</strong><span>Algún producto cambió de disponibilidad o stock.</span></div> : null}
      <div className="cart-layout">
        <div className="cart-lines">
          {cart.items.map((item) => (
            <article className={item.availability === "AVAILABLE" ? "cart-line" : "cart-line cart-line--issue"} key={item.id}>
              <Link className="cart-line__image" href={`/producto/${item.productSlug}`}>
                <Image alt={item.imageAlt} fill sizes="120px" src={item.imageUrl ?? "/product-placeholder.svg"} />
              </Link>
              <div className="cart-line__info">
                <p className="eyebrow">SKU {item.sku}</p>
                <h2><Link href={`/producto/${item.productSlug}`}>{item.productName}</Link></h2>
                <p>{item.variantName}</p>
                <strong>{formatMoney(item.unitPriceInCents)}</strong>
                {item.priceChanged ? <p className="cart-notice">El precio cambió y fue recalculado.</p> : null}
                {item.availabilityMessage ? <p className="cart-notice cart-notice--error" role="alert">{item.availabilityMessage}</p> : null}
              </div>
              <div className="cart-line__actions">
                <CartQuantityControl currentQuantity={item.quantity} key={`${item.variantId}-${item.quantity}-${cart.version}`} maximum={item.availableStock} variantId={item.variantId} />
                <RemoveCartItemButton variantId={item.variantId} />
              </div>
              <strong className="cart-line__subtotal">{formatMoney(item.lineSubtotalInCents)}</strong>
            </article>
          ))}
        </div>
        <aside className="cart-summary">
          <p className="eyebrow">Resumen</p>
          <div><span>Unidades</span><strong>{cart.itemCount}</strong></div>
          <div className="cart-summary__total"><span>Subtotal</span><strong>{formatMoney(cart.subtotalInCents)}</strong></div>
          <p>Los precios y el stock se validan nuevamente en el servidor. El carrito no reserva unidades.</p>
          <button className="button button--primary button--wide" disabled type="button">Checkout disponible en FASE 4</button>
          <ClearCartButton />
        </aside>
      </div>
    </section>
  );
}
