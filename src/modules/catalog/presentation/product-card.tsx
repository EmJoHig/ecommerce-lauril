import Image from "next/image";
import Link from "next/link";
import type { CatalogProduct } from "../domain/product";
import { getLowestProductPrice } from "../domain/product";
import { formatMoney } from "@/shared/domain/money";
import { AddToCartButton } from "./add-to-cart-button";

export function ProductCard({ product, storeName }: { product: CatalogProduct; storeName: string }) {
  const hasStock = product.variants.some((variant) => variant.availableStock > 0);
  const purchaseVariant = product.variants.find((variant) => variant.isDefault && variant.availableStock > 0)
    ?? product.variants.find((variant) => variant.availableStock > 0);
  const hasOffer = product.variants.some((variant) => variant.promotionalPriceInCents !== null);

  return (
    <article className="product-card">
      <Link className="product-card__image" href={`/producto/${product.slug}`}>
        <Image
          alt={product.imageAlt ?? product.name}
          fill
          sizes="(max-width: 430px) 50vw, (max-width: 960px) 50vw, (max-width: 1280px) 33vw, 25vw"
          src={product.imageUrl ?? "/product-placeholder.svg"}
        />
        {hasOffer ? <span className="pill">Oferta</span> : product.featured ? <span className="pill">Destacado</span> : null}
      </Link>
      <div className="product-card__body">
        <p className="eyebrow">
          {product.categories[0]?.name ?? `Colección ${storeName}`}
        </p>
        <h3>
          <Link href={`/producto/${product.slug}`}>{product.name}</Link>
        </h3>
        <p className="product-card__description">
          {product.shortDescription ?? "Una pieza elegida para disfrutar todos los días."}
        </p>
        <div className="product-card__footer">
          <div><small>{product.variants.length > 1 ? "Desde" : "Precio"}</small><strong>{formatMoney(getLowestProductPrice(product))}</strong></div>
          <span className={hasStock ? "stock stock--ok" : "stock stock--out"}>
            {hasStock ? "Disponible" : "Sin stock"}
          </span>
        </div>
        {purchaseVariant ? <AddToCartButton variantId={purchaseVariant.id} /> : <button className="product-card__add" disabled type="button">Sin stock</button>}
        <Link className="product-card__cta" href={`/producto/${product.slug}`}>Ver detalle <span aria-hidden="true">→</span></Link>
      </div>
    </article>
  );
}
