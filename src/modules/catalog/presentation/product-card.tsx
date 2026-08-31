import Image from "next/image";
import Link from "next/link";
import type { CatalogProduct } from "../domain/product";
import { getLowestProductPrice } from "../domain/product";
import { formatMoney } from "@/shared/domain/money";

export function ProductCard({ product }: { product: CatalogProduct }) {
  const hasStock = product.variants.some((variant) => variant.availableStock > 0);

  return (
    <article className="product-card">
      <Link className="product-card__image" href={`/productos/${product.slug}`}>
        <Image
          alt={product.imageAlt ?? product.name}
          fill
          sizes="(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 33vw"
          src={product.imageUrl ?? "/product-placeholder.svg"}
        />
        {product.featured ? <span className="pill">Destacado</span> : null}
      </Link>
      <div className="product-card__body">
        <p className="eyebrow">
          {product.categories[0]?.name ?? "Colección Lauril"}
        </p>
        <h3>
          <Link href={`/productos/${product.slug}`}>{product.name}</Link>
        </h3>
        <p className="product-card__description">
          {product.shortDescription ?? "Una pieza elegida para disfrutar todos los días."}
        </p>
        <div className="product-card__footer">
          <strong>Desde {formatMoney(getLowestProductPrice(product))}</strong>
          <span className={hasStock ? "stock stock--ok" : "stock stock--out"}>
            {hasStock ? "Disponible" : "Sin stock"}
          </span>
        </div>
      </div>
    </article>
  );
}
