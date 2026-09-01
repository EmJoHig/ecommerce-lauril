"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useState } from "react";
import { addCartItemAction } from "@/modules/cart/presentation/cart-actions";
import { initialCartActionState } from "@/modules/cart/presentation/cart-action-state";

type VariantView = { id: string; sku: string; name: string; price: string; regularPrice: string | null; availableStock: number; isDefault: boolean };

export function ProductDetail({ name, images, variants }: Readonly<{
  name: string;
  images: ReadonlyArray<{ id: string; url: string; altText: string }>;
  variants: ReadonlyArray<VariantView>;
}>) {
  const [variantId, setVariantId] = useState(variants.find((variant) => variant.isDefault)?.id ?? variants[0]?.id);
  const [imageId, setImageId] = useState(images[0]?.id);
  const [quantity, setQuantity] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [state, action, pending] = useActionState(
    addCartItemAction,
    initialCartActionState,
  );
  const variant = variants.find((item) => item.id === variantId) ?? variants[0];
  const image = images.find((item) => item.id === imageId) ?? images[0];
  if (!variant) return null;
  return <div className="product-purchase-view">
    <div><div className="product-detail__image"><Image alt={image?.altText ?? name} fill priority sizes="(max-width: 800px) 100vw, 56vw" src={image?.url ?? "/product-placeholder.svg"} /></div>{images.length > 1 ? <div className="product-thumbnails">{images.map((item) => <button aria-label={`Ver ${item.altText}`} className={item.id === image?.id ? "is-active" : ""} key={item.id} onClick={() => setImageId(item.id)} type="button"><Image alt="" fill sizes="72px" src={item.url} /></button>)}</div> : null}</div>
    <div className="variant-picker">
      <div className="product-detail__price">{variant.regularPrice ? <del>{variant.regularPrice}</del> : null}<strong>{variant.price}</strong></div>
      {variants.length > 1 ? <fieldset><legend>Elegí una variante</legend>{variants.map((item) => <button aria-pressed={item.id === variant.id} className={item.id === variant.id ? "variant-option is-active" : "variant-option"} key={item.id} onClick={() => { setVariantId(item.id); setQuantity(1); }} type="button"><span>{item.name}</span><small>SKU {item.sku} · {item.availableStock > 0 ? `${item.availableStock} disponibles` : "Sin stock"}</small></button>)}</fieldset> : <div className="single-variant"><strong>{variant.name}</strong><small>SKU {variant.sku} · {variant.availableStock > 0 ? `${variant.availableStock} disponibles` : "Sin stock"}</small></div>}
      <form action={action} className="add-cart-form" onSubmit={() => setDrawerOpen(true)}>
        <input name="variantId" type="hidden" value={variant.id} />
        <label>
          Cantidad
          <input
            disabled={pending || variant.availableStock < 1}
            max={Math.max(variant.availableStock, 1)}
            min={1}
            name="quantity"
            onChange={(event) => setQuantity(Number(event.target.value))}
            type="number"
            value={quantity}
          />
        </label>
        <button className="button button--primary button--wide" disabled={pending || variant.availableStock < 1} type="submit">
          {pending ? "Agregando…" : variant.availableStock > 0 ? "Agregar al carrito" : "Sin stock"}
        </button>
      </form>
      {state.status === "error" ? <p className="cart-feedback action-error" role="alert">{state.message}</p> : null}
      {state.status === "success" ? <p className="cart-feedback action-success" role="status">{state.message}</p> : null}
    </div>
    {drawerOpen && state.status === "success" ? <aside aria-label="Resumen del carrito" className="mini-cart" role="dialog"><button aria-label="Cerrar resumen del carrito" className="mini-cart__close" onClick={() => setDrawerOpen(false)} type="button">×</button><p className="eyebrow">Agregado</p><h2>Tu bolsa</h2><div className="mini-cart__items">{state.items.map((item) => <div key={item.variantId}><span><strong>{item.productName}</strong><small>{item.variantName} · {item.quantity} u.</small></span><b>{item.unitPrice}</b></div>)}</div><div className="mini-cart__total"><span>{state.itemCount} unidades</span><strong>{state.subtotal}</strong></div><Link className="button button--dark button--wide" href="/carrito">Ver carrito</Link><button className="text-link mini-cart__continue" onClick={() => setDrawerOpen(false)} type="button">Seguir comprando</button></aside> : null}
  </div>;
}
