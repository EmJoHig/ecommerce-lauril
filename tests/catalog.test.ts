import { describe, expect, it } from "vitest";
import { getLowestProductPrice, normalizeSlug } from "@/modules/catalog/domain/product";

describe("catalog domain", () => {
  it("normaliza slugs amigables y estables", () => {
    expect(normalizeSlug("  Jarra Ámbar & Té  ")).toBe("jarra-ambar-te");
  });

  it("obtiene el menor precio efectivo entre variantes", () => {
    expect(
      getLowestProductPrice({
        id: "product-1",
        name: "Producto",
        slug: "producto",
        shortDescription: null,
        description: null,
        featured: false,
        imageUrl: null,
        imageAlt: null,
        categories: [],
        variants: [
          {
            id: "variant-1",
            sku: "ONE",
            name: "Uno",
            attributes: {},
            priceInCents: 15000n,
            promotionalPriceInCents: null,
            currentPriceInCents: 15000n,
            availableStock: 1,
            isDefault: true,
          },
          {
            id: "variant-2",
            sku: "TWO",
            name: "Dos",
            attributes: {},
            priceInCents: 14000n,
            promotionalPriceInCents: 12000n,
            currentPriceInCents: 12000n,
            availableStock: 1,
            isDefault: false,
          },
        ],
      }),
    ).toBe(12000n);
  });
});
