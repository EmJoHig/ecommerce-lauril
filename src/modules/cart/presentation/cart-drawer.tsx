"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { CartQuantityControl, RemoveCartItemButton } from "./cart-controls";
import { cartOpenEvent, cartUpdatedEvent } from "./cart-events";

export type CartDrawerView = Readonly<{
  itemCount: number;
  subtotal: string;
  hasIssues: boolean;
  items: ReadonlyArray<Readonly<{
    id: string;
    variantId: string;
    productSlug: string;
    productName: string;
    variantName: string;
    imageUrl: string | null;
    imageAlt: string;
    quantity: number;
    availableStock: number;
    unitPrice: string;
    lineSubtotal: string;
    availability: string;
    availabilityMessage: string | null;
  }>>;
}>;

export function CartDrawer({ cart }: { cart: CartDrawerView }) {
  const [open, setOpen] = useState(false);
  const [bump, setBump] = useState(false);
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const previousCount = useRef(cart.itemCount);

  useEffect(() => {
    function openCart() {
      setOpen(true);
    }
    function animateCart() {
      setBump(true);
      window.setTimeout(() => setBump(false), 320);
    }
    window.addEventListener(cartOpenEvent, openCart);
    window.addEventListener(cartUpdatedEvent, animateCart);
    return () => {
      window.removeEventListener(cartOpenEvent, openCart);
      window.removeEventListener(cartUpdatedEvent, animateCart);
    };
  }, []);

  useEffect(() => {
    if (previousCount.current !== cart.itemCount) {
      previousCount.current = cart.itemCount;
      setBump(true);
      const timeout = window.setTimeout(() => setBump(false), 320);
      return () => window.clearTimeout(timeout);
    }
  }, [cart.itemCount]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const trigger = triggerRef.current;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>("[data-cart-close]")?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
      )];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      (previousFocus ?? trigger)?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Abrir carrito con ${cart.itemCount} unidades`}
        className={`cart-trigger${bump ? " is-bumping" : ""}`}
        onClick={() => setOpen(true)}
        ref={triggerRef}
        type="button"
      >
        <CartIcon />
        <span className="cart-trigger__label">Carrito</span>
        <span aria-hidden="true" className="cart-count">{cart.itemCount}</span>
      </button>

      <div aria-hidden={!open} className={`cart-drawer-root${open ? " is-open" : ""}`}>
        <button aria-label="Cerrar carrito" className="cart-drawer__overlay" onClick={() => setOpen(false)} tabIndex={open ? 0 : -1} type="button" />
        <aside aria-labelledby={titleId} aria-modal="true" className="cart-drawer" ref={panelRef} role="dialog">
          <header className="cart-drawer__header">
            <div>
              <p className="eyebrow">Tu selección</p>
              <h2 id={titleId}>Mi carrito</h2>
            </div>
            <button aria-label="Cerrar carrito" className="cart-drawer__close" data-cart-close onClick={() => setOpen(false)} type="button">×</button>
          </header>

          {cart.items.length === 0 ? (
            <div className="cart-drawer__empty">
              <span aria-hidden="true"><CartIcon /></span>
              <h3>Tu carrito está vacío</h3>
              <p>Descubrí la colección y elegí tus próximos favoritos.</p>
              <Link className="button button--primary" href="/productos" onClick={() => setOpen(false)}>Ver productos</Link>
            </div>
          ) : (
            <>
              <div className="cart-drawer__body">
                {cart.hasIssues ? <div className="cart-warning" role="alert"><strong>Revisá tu carrito</strong><span>Hay productos con cambios de disponibilidad.</span></div> : null}
                <div className="cart-drawer__items">
                  {cart.items.map((item) => (
                    <article className={item.availability === "AVAILABLE" ? "drawer-item" : "drawer-item drawer-item--issue"} key={item.id}>
                      <Link className="drawer-item__image" href={`/producto/${item.productSlug}`} onClick={() => setOpen(false)}>
                        <Image alt={item.imageAlt} fill sizes="88px" src={item.imageUrl ?? "/product-placeholder.svg"} />
                      </Link>
                      <div className="drawer-item__content">
                        <div className="drawer-item__heading">
                          <div><h3><Link href={`/producto/${item.productSlug}`} onClick={() => setOpen(false)}>{item.productName}</Link></h3><p>{item.variantName}</p></div>
                          <RemoveCartItemButton iconOnly variantId={item.variantId} />
                        </div>
                        <div className="drawer-item__price"><span>{item.unitPrice}</span><strong>{item.lineSubtotal}</strong></div>
                        <CartQuantityControl compact currentQuantity={item.quantity} key={`${item.variantId}-${item.quantity}`} maximum={item.availableStock} variantId={item.variantId} />
                        {item.availabilityMessage ? <p className="cart-notice cart-notice--error" role="alert">{item.availabilityMessage}</p> : null}
                      </div>
                    </article>
                  ))}
                </div>

                <details className="shipping-estimator">
                  <summary>Calculá el costo de envío <span aria-hidden="true">+</span></summary>
                  <div>
                    <label htmlFor="drawer-postcode">Código postal</label>
                    <div className="shipping-estimator__form">
                      <input disabled id="drawer-postcode" inputMode="numeric" placeholder="Ej. 1425" type="text" />
                      <button className="button button--primary" disabled type="button">Calcular</button>
                    </div>
                    <p>La cotización por código postal todavía no está disponible. Podrás elegir los métodos habilitados al iniciar la compra.</p>
                  </div>
                </details>
              </div>

              <footer className="cart-drawer__footer">
                <dl className="drawer-totals">
                  <div><dt>Subtotal</dt><dd>{cart.subtotal}</dd></div>
                  <div><dt>Envío</dt><dd>A definir en checkout</dd></div>
                  <div className="drawer-totals__total"><dt>Total parcial</dt><dd>{cart.subtotal}</dd></div>
                </dl>
                <Link className="button button--primary button--wide" href="/checkout" onClick={() => setOpen(false)}>Iniciar compra</Link>
                <button className="cart-drawer__continue" onClick={() => setOpen(false)} type="button">Seguir comprando</button>
              </footer>
            </>
          )}
        </aside>
      </div>
    </>
  );
}

function CartIcon() {
  return <svg aria-hidden="true" fill="none" height="22" viewBox="0 0 24 24" width="22"><path d="M3 4h2l2.2 10.1a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L20.4 8H6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8"/><circle cx="10" cy="20" fill="currentColor" r="1.4"/><circle cx="18" cy="20" fill="currentColor" r="1.4"/></svg>;
}
