"use client";

import Image from "next/image";
import { useState } from "react";

type VariantView = { id: string; sku: string; name: string; price: string; regularPrice: string | null; availableStock: number; isDefault: boolean };

export function ProductDetail({ name, images, variants }: Readonly<{
  name: string;
  images: ReadonlyArray<{ id: string; url: string; altText: string }>;
  variants: ReadonlyArray<VariantView>;
}>) {
  const [variantId, setVariantId] = useState(variants.find((variant) => variant.isDefault)?.id ?? variants[0]?.id);
  const [imageId, setImageId] = useState(images[0]?.id);
  const variant = variants.find((item) => item.id === variantId) ?? variants[0];
  const image = images.find((item) => item.id === imageId) ?? images[0];
  if (!variant) return null;
  return <div className="product-purchase-view">
    <div><div className="product-detail__image"><Image alt={image?.altText ?? name} fill priority sizes="(max-width: 800px) 100vw, 56vw" src={image?.url ?? "/product-placeholder.svg"} /></div>{images.length > 1 ? <div className="product-thumbnails">{images.map((item) => <button aria-label={`Ver ${item.altText}`} className={item.id === image?.id ? "is-active" : ""} key={item.id} onClick={() => setImageId(item.id)} type="button"><Image alt="" fill sizes="72px" src={item.url} /></button>)}</div> : null}</div>
    <div className="variant-picker"><div className="product-detail__price">{variant.regularPrice ? <del>{variant.regularPrice}</del> : null}<strong>{variant.price}</strong></div>{variants.length > 1 ? <fieldset><legend>Elegí una variante</legend>{variants.map((item) => <button aria-pressed={item.id === variant.id} className={item.id === variant.id ? "variant-option is-active" : "variant-option"} key={item.id} onClick={() => setVariantId(item.id)} type="button"><span>{item.name}</span><small>SKU {item.sku} · {item.availableStock > 0 ? `${item.availableStock} disponibles` : "Sin stock"}</small></button>)}</fieldset> : <div className="single-variant"><strong>{variant.name}</strong><small>SKU {variant.sku} · {variant.availableStock > 0 ? `${variant.availableStock} disponibles` : "Sin stock"}</small></div>}<button className="button button--primary button--wide" disabled type="button">Compra disponible en una próxima fase</button></div>
  </div>;
}
