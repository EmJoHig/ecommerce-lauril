import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCatalogService } from "@/modules/catalog/infrastructure/catalog-composition";
import { formatMoney } from "@/shared/domain/money";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getCatalogService().getProduct(slug);
  if (!product) notFound();

  const defaultVariant = product.variants.find((variant) => variant.isDefault) ?? product.variants[0];
  if (!defaultVariant) notFound();

  return (
    <section className="product-detail section">
      <div className="product-detail__image">
        <Image
          alt={product.imageAlt ?? product.name}
          fill
          priority
          sizes="(max-width: 800px) 100vw, 56vw"
          src={product.imageUrl ?? "/product-placeholder.svg"}
        />
      </div>
      <div className="product-detail__copy">
        <Link className="text-link" href="/productos">← Volver a la tienda</Link>
        <p className="eyebrow">{product.categories.map((category) => category.name).join(" · ")}</p>
        <h1>{product.name}</h1>
        <p className="product-detail__price">{formatMoney(defaultVariant.currentPriceInCents)}</p>
        <p>{product.description ?? product.shortDescription}</p>
        <div className="variant-list">
          {product.variants.map((variant) => (
            <div className="variant-row" key={variant.id}>
              <span><strong>{variant.name}</strong><small>SKU {variant.sku}</small></span>
              <span>{formatMoney(variant.currentPriceInCents)} · {variant.availableStock} disponibles</span>
            </div>
          ))}
        </div>
        <button className="button button--primary button--wide" disabled type="button">
          Carrito disponible en Fase 2
        </button>
        <div className="product-notes"><span>✓ Stock validado en servidor</span><span>✓ Envíos configurables próximamente</span></div>
      </div>
    </section>
  );
}
