import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CatalogProduct } from "@/modules/catalog/domain/product";

vi.mock("@/shared/presentation/product-image", () => ({ ProductImage: () => createElement("span", { "data-image": "product" }) }));
vi.mock("@/modules/catalog/presentation/add-to-cart-button", () => ({ AddToCartButton: () => createElement("button", null, "Agregar al carrito") }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/modules/cart/presentation/cart-actions", () => ({ addCartItemAction: vi.fn() }));
vi.mock("@/modules/catalog/presentation/catalog-auto-form", () => ({
  CatalogAutoForm: ({ children }: { children: React.ReactNode }) => createElement("form", null, children),
  CatalogProductArea: ({ children }: { children: React.ReactNode }) => createElement("div", null, children),
}));

import { ProductCard } from "@/modules/catalog/presentation/product-card";
import { ProductDetail } from "@/modules/catalog/presentation/product-detail";
import { PublicCatalog } from "@/modules/catalog/presentation/public-catalog";

const product: CatalogProduct = {
  id: "p1", name: "Perfume para textiles", slug: "perfume-para-textiles", shortDescription: null,
  description: null, featured: false, seoTitle: null, seoDescription: null,
  imageUrl: null, imageAlt: null, images: [], categories: [],
  variants: [
    { id: "v1", sku: "SKU1", name: "Coco", attributes: {}, priceInCents: 380000n, promotionalPriceInCents: null, currentPriceInCents: 380000n, availableStock: 3, isDefault: true },
    { id: "v2", sku: "SKU2", name: "Vainilla", attributes: {}, priceInCents: 420000n, promotionalPriceInCents: null, currentPriceInCents: 420000n, availableStock: 0, isDefault: false },
  ],
};

describe("catálogo público B2", () => {
  it("envía productos con variantes a la elección explícita", () => {
    const html = renderToStaticMarkup(createElement(ProductCard, { product, storeName: "Lauril" }));
    expect(html).toContain("Ver variantes");
    expect(html).toContain("2 variantes");
    expect(html).not.toContain("Agregar al carrito");
  });

  it("mantiene compra directa en productos de una variante", () => {
    const html = renderToStaticMarkup(createElement(ProductCard, { product: { ...product, variants: product.variants.slice(0, 1) }, storeName: "Lauril" }));
    expect(html).toContain("Agregar al carrito");
    expect(html).not.toContain("Ver variantes");
  });

  it("muestra precios y stock por variante antes de comprar", () => {
    const html = renderToStaticMarkup(createElement(ProductDetail, {
      name: product.name, images: [],
      variants: product.variants.map((variant) => ({
        id: variant.id, sku: variant.sku, name: variant.name,
        price: `$ ${variant.currentPriceInCents / 100n}`, regularPrice: null,
        availableStock: variant.availableStock, isDefault: variant.isDefault,
      })),
    }));
    expect(html).toContain("Elegí una variante");
    expect(html).toContain("Coco");
    expect(html).toContain("Vainilla");
    expect(html).toContain("Sin stock");
    expect(html).toContain('aria-pressed="true"');
  });

  it("no crea enlaces navegables a páginas fuera de rango", () => {
    const html = renderToStaticMarkup(createElement(PublicCatalog, {
      page: { items: [], total: 24, page: 1, pageSize: 12, pageCount: 2 },
      categories: [], fragrances: [], search: "", sort: "featured", storeName: "Lauril",
    }));
    expect(html).toContain('aria-disabled="true">← Anterior</span>');
    expect(html).toContain("Siguiente →</a>");
  });
});
