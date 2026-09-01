import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCatalogService } from "@/modules/catalog/infrastructure/catalog-composition";
import { ProductDetail } from "@/modules/catalog/presentation/product-detail";
import { getServerEnv } from "@/shared/infrastructure/env";
import { formatMoney, moneyToDecimalString } from "@/shared/domain/money";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params; const product = await getCatalogService().getProduct(slug); if (!product) return {};
  const description = product.seoDescription ?? product.shortDescription ?? product.description ?? `Conocé ${product.name} en Lauril.`;
  const canonical = `${getServerEnv().APP_URL}/producto/${product.slug}`;
  return { title: product.seoTitle ?? product.name, description, alternates: { canonical }, openGraph: { type: "website", title: product.seoTitle ?? product.name, description, url: canonical, images: product.images.map((image) => ({ url: image.url, alt: image.altText })) } };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const product = await getCatalogService().getProduct(slug); if (!product) notFound();
  const canonical = `${getServerEnv().APP_URL}/producto/${product.slug}`;
  const jsonLd = { "@context": "https://schema.org", "@type": "Product", name: product.name, description: product.description ?? product.shortDescription ?? undefined, image: product.images.map((image) => new URL(image.url, getServerEnv().APP_URL).toString()), category: product.categories.map((category) => category.name).join(", "), offers: product.variants.map((variant) => ({ "@type": "Offer", sku: variant.sku, name: variant.name, priceCurrency: "ARS", price: moneyToDecimalString(variant.currentPriceInCents), availability: variant.availableStock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", url: canonical })) };
  return <section className="product-detail section"><script dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} type="application/ld+json" /><div className="product-detail__heading"><Link className="text-link" href="/productos">← Volver al catálogo</Link><p className="eyebrow">{product.categories.map((category) => category.name).join(" · ") || "Lauril"}</p><h1>{product.name}</h1><p>{product.description ?? product.shortDescription}</p></div><ProductDetail images={product.images} name={product.name} variants={product.variants.map((variant) => ({ id: variant.id, sku: variant.sku, name: variant.name, price: formatMoney(variant.currentPriceInCents), regularPrice: variant.promotionalPriceInCents === null ? null : formatMoney(variant.priceInCents), availableStock: variant.availableStock, isDefault: variant.isDefault }))} /></section>;
}
