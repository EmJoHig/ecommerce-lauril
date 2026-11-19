import Link from "next/link";
import type { CatalogProduct } from "../domain/product";
import { getLowestProductPrice } from "../domain/product";
import { formatMoney } from "@/shared/domain/money";
import { ProductImage } from "@/shared/presentation/product-image";
import { AddToCartButton } from "./add-to-cart-button";

export function ProductCard({ product, storeName, compact = false }: { product: CatalogProduct; storeName: string; compact?: boolean }) {
  const hasStock = product.variants.some((variant) => variant.availableStock > 0);
  const purchaseVariant = product.variants.find((variant) => variant.isDefault && variant.availableStock > 0)
    ?? product.variants.find((variant) => variant.availableStock > 0);
  const hasOffer = product.variants.some((variant) => variant.promotionalPriceInCents !== null);

  return (
    <article className="product-card">
      <Link className="product-card__image" href={`/producto/${product.slug}`}>
        <ProductImage alt={product.imageAlt ?? product.name} sizes="(max-width: 430px) 50vw, (max-width: 960px) 50vw, (max-width: 1280px) 33vw, 25vw" src={product.imageUrl} />
        {!compact && (hasOffer ? <span className="pill">Oferta</span> : product.featured ? <span className="pill">Destacado</span> : null)}
      </Link>
      <div className="product-card__body">
        {!compact ? <p className="eyebrow">
          {product.categories[0]?.name ?? `Colección ${storeName}`}
        </p> : null}
        <h3>
          <Link href={`/producto/${product.slug}`}>{product.name}</Link>
        </h3>
        {!compact && product.variants.length > 1 ? <p className="product-card__variants">{product.variants.length} variantes · elegí la tuya</p> : null}
        {!compact && product.shortDescription ? <p className="product-card__description">
          {product.shortDescription}
        </p> : null}
        <div className="product-card__footer">
          <div>{!compact ? <small>{product.variants.length > 1 ? "Desde" : "Precio"}</small> : null}<strong>{formatMoney(getLowestProductPrice(product))}</strong></div>
          {!compact ? <span className={hasStock ? "stock stock--ok" : "stock stock--out"}>
            {hasStock ? "Disponible" : "Sin stock"}
          </span> : null}
        </div>
        {!compact ? product.variants.length > 1
          ? <Link className="product-card__add product-card__choose" href={`/producto/${product.slug}`}>Ver variantes</Link>
          : purchaseVariant ? <AddToCartButton variantId={purchaseVariant.id} /> : <button className="product-card__add" disabled type="button">Sin stock</button> : null}
        {/* <Link className="product-card__cta" href={`/producto/${product.slug}`}>Ver detalle <span aria-hidden="true">→</span></Link> */}
      </div>
    </article>
  );
}
