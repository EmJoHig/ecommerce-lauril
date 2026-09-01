import { describe, expect, it } from "vitest";
import { CartService } from "@/modules/cart/application/cart-service";
import type {
  CartIdentity,
  CartItemRecord,
  CartRecord,
  CartRepository,
  CartTransaction,
  CartVariantRecord,
} from "@/modules/cart/application/cart-repository";
import {
  calculateCartItemCount,
  calculateCartSubtotal,
  calculateLineSubtotal,
} from "@/modules/cart/domain/cart";
import {
  createGuestCartToken,
  hashGuestCartToken,
  isGuestCartToken,
} from "@/modules/cart/domain/guest-cart-token";
import { NotFoundError, ValidationError } from "@/shared/domain/errors";

const variantId = "2d45820e-f6ac-405d-a72c-f3ce7e3d6daf";
const secondVariantId = "7f79a006-6afd-4f87-92aa-b6420cad5688";
const tokenA = "a".repeat(64);
const tokenB = "b".repeat(64);
const now = new Date("2026-08-31T15:00:00.000Z");

function variant(overrides: Partial<CartVariantRecord> = {}): CartVariantRecord {
  return {
    id: variantId,
    sku: "LAU-TEST-001",
    name: "250 cc",
    isActive: true,
    priceInCents: 410000n,
    promotionalPriceInCents: null,
    product: {
      id: "11f105f4-4ca9-414f-89de-f58b9670ec4d",
      name: "Perfumina Textil",
      slug: "perfumina-textil",
      status: "ACTIVE",
      image: { url: "/product-placeholder.svg", altText: "Perfumina" },
    },
    inventory: { stockOnHand: 10, stockReserved: 2 },
    ...overrides,
  };
}

describe("cart domain", () => {
  it("calcula subtotales monetarios e itemCount sin floating point", () => {
    expect(calculateLineSubtotal(410000n, 3)).toBe(1230000n);
    expect(calculateCartSubtotal([1230000n, 250050n])).toBe(1480050n);
    expect(calculateCartItemCount([3, 2])).toBe(5);
  });

  it("genera identificadores invitados impredecibles y persiste solo su hash", () => {
    const first = createGuestCartToken();
    const second = createGuestCartToken();
    expect(isGuestCartToken(first)).toBe(true);
    expect(first).not.toBe(second);
    expect(hashGuestCartToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashGuestCartToken(first)).not.toContain(first);
  });
});

describe("anonymous cart use cases", () => {
  it("agrega una variante usando precio y stock actuales del servidor", async () => {
    const repository = new MemoryCartRepository([variant({ promotionalPriceInCents: 399000n })]);
    const cart = await new CartService(repository).addItem({ tokenHash: tokenA, variantId, quantity: 2 }, now);
    expect(cart).toMatchObject({ itemCount: 2, subtotalInCents: 798000n, hasIssues: false });
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]).toMatchObject({ variantId, quantity: 2, unitPriceInCents: 399000n });
  });

  it("suma cantidades de la misma variante sin crear líneas duplicadas", async () => {
    const repository = new MemoryCartRepository([variant()]);
    const service = new CartService(repository);
    await service.addItem({ tokenHash: tokenA, variantId, quantity: 1 }, now);
    const cart = await service.addItem({ tokenHash: tokenA, variantId, quantity: 2 }, now);
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]?.quantity).toBe(3);
  });

  it("cambia cantidad, elimina artículos y vacía el carrito", async () => {
    const repository = new MemoryCartRepository([
      variant(),
      variant({ id: secondVariantId, sku: "LAU-TEST-002", name: "500 cc" }),
    ]);
    const service = new CartService(repository);
    await service.addItem({ tokenHash: tokenA, variantId, quantity: 1 }, now);
    await service.addItem({ tokenHash: tokenA, variantId: secondVariantId, quantity: 1 }, now);
    const updated = await service.updateItemQuantity({ tokenHash: tokenA, variantId, quantity: 4 }, now);
    expect(updated.itemCount).toBe(5);
    const removed = await service.removeItem(tokenA, secondVariantId, now);
    expect(removed.items.map(({ variantId: id }) => id)).toEqual([variantId]);
    expect((await service.clearCart(tokenA, now)).items).toEqual([]);
  });

  it("recalcula un precio cambiado y lo informa sin confiar en el snapshot", async () => {
    const repository = new MemoryCartRepository([variant()]);
    const service = new CartService(repository);
    await service.addItem({ tokenHash: tokenA, variantId, quantity: 2 }, now);
    repository.setVariant(variant({ priceInCents: 450000n }));
    const cart = await service.getCart(tokenA, now);
    expect(cart.subtotalInCents).toBe(900000n);
    expect(cart.items[0]).toMatchObject({ priceChanged: true, unitPriceInCents: 450000n });
  });

  it("rechaza productos o variantes inactivas", async () => {
    const productInactive = new CartService(
      new MemoryCartRepository([variant({ product: { ...variant().product, status: "INACTIVE" } })]),
    );
    await expect(productInactive.addItem({ tokenHash: tokenA, variantId, quantity: 1 }, now)).rejects.toThrow("producto ya no está disponible");
    const variantInactive = new CartService(
      new MemoryCartRepository([variant({ isActive: false })]),
    );
    await expect(variantInactive.addItem({ tokenHash: tokenA, variantId, quantity: 1 }, now)).rejects.toThrow("variante ya no está disponible");
  });

  it("rechaza stock insuficiente y detecta una baja posterior", async () => {
    const repository = new MemoryCartRepository([variant()]);
    const service = new CartService(repository);
    await expect(service.addItem({ tokenHash: tokenA, variantId, quantity: 9 }, now)).rejects.toThrow("Solo hay 8");
    await service.addItem({ tokenHash: tokenA, variantId, quantity: 2 }, now);
    repository.setVariant(variant({ inventory: { stockOnHand: 2, stockReserved: 1 } }));
    const cart = await service.getCart(tokenA, now);
    expect(cart.items[0]).toMatchObject({ availability: "INSUFFICIENT_STOCK", availableStock: 1 });
    await expect(service.updateItemQuantity({ tokenHash: tokenA, variantId, quantity: 2 }, now)).rejects.toThrow("Solo hay 1");
  });

  it("devuelve vacío para carrito inexistente y rechaza mutaciones sin propiedad", async () => {
    const service = new CartService(new MemoryCartRepository([variant()]));
    expect(await service.getCart(tokenA, now)).toMatchObject({ items: [], itemCount: 0 });
    await expect(service.removeItem(tokenA, variantId, now)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("aísla dos carritos aunque contengan la misma variante", async () => {
    const service = new CartService(new MemoryCartRepository([variant()]));
    await service.addItem({ tokenHash: tokenA, variantId, quantity: 1 }, now);
    await service.addItem({ tokenHash: tokenB, variantId, quantity: 3 }, now);
    expect((await service.getCart(tokenA, now)).itemCount).toBe(1);
    expect((await service.getCart(tokenB, now)).itemCount).toBe(3);
  });

  it("rechaza cantidades inválidas", async () => {
    const service = new CartService(new MemoryCartRepository([variant()]));
    for (const quantity of [0, -1, 1.5, 1000]) {
      await expect(service.addItem({ tokenHash: tokenA, variantId, quantity }, now)).rejects.toBeInstanceOf(ValidationError);
    }
  });
});

class MemoryCartRepository implements CartRepository {
  private readonly carts = new Map<string, MutableCart>();
  private readonly variants = new Map<string, CartVariantRecord>();
  private sequence = 0;

  constructor(variants: CartVariantRecord[]) {
    for (const item of variants) this.variants.set(item.id, item);
  }

  setVariant(item: CartVariantRecord): void {
    this.variants.set(item.id, item);
  }

  findActiveByTokenHash(tokenHash: string, date: Date): Promise<CartRecord | null> {
    const cart = this.carts.get(tokenHash);
    return Promise.resolve(
      cart?.status === "ACTIVE" && cart.expiresAt > date
        ? toRecord(cart, this.variants)
        : null,
    );
  }

  async run<T>(work: (transaction: CartTransaction) => Promise<T>): Promise<T> {
    return work(this.transaction());
  }

  private transaction(): CartTransaction {
    return {
      findCartByTokenHash: async (tokenHash) => {
        const cart = this.carts.get(tokenHash);
        return cart ? identity(cart) : null;
      },
      createCart: async ({ tokenHash, expiresAt }) => {
        const cart: MutableCart = {
          id: `cart-${++this.sequence}`,
          tokenHash,
          status: "ACTIVE",
          expiresAt,
          version: 0,
          items: new Map(),
        };
        this.carts.set(tokenHash, cart);
        return identity(cart);
      },
      resetCart: async ({ id, expiresAt }) => {
        const cart = this.findCart(id);
        cart.items.clear();
        cart.status = "ACTIVE";
        cart.expiresAt = expiresAt;
        cart.version += 1;
        return identity(cart);
      },
      findVariant: async (id) => this.variants.get(id) ?? null,
      findItem: async (cartId, id) => this.findCart(cartId).items.get(id) ?? null,
      setItem: async (input) => {
        const cart = this.findCart(input.cartId);
        const current = cart.items.get(input.variantId);
        const selected = this.variants.get(input.variantId);
        if (!selected) throw new Error("Variante de prueba inexistente.");
        cart.items.set(input.variantId, {
          id: current?.id ?? `item-${++this.sequence}`,
          variantId: input.variantId,
          quantity: input.quantity,
          unitPriceSnapshotInCents: input.unitPriceSnapshotInCents,
          createdAt: current?.createdAt ?? now,
          variant: selected,
        });
      },
      removeItem: async (cartId, id) => this.findCart(cartId).items.delete(id),
      clearItems: async (cartId) => { this.findCart(cartId).items.clear(); },
      touchCart: async (cartId, expiresAt) => {
        const cart = this.findCart(cartId);
        cart.expiresAt = expiresAt;
        cart.version += 1;
      },
      readCart: async (cartId) => toRecord(this.findCart(cartId), this.variants),
    };
  }

  private findCart(id: string): MutableCart {
    const cart = [...this.carts.values()].find((candidate) => candidate.id === id);
    if (!cart) throw new Error("Carrito de prueba inexistente.");
    return cart;
  }
}

type MutableCart = {
  id: string;
  tokenHash: string;
  status: "ACTIVE" | "CONVERTED" | "ABANDONED";
  expiresAt: Date;
  version: number;
  items: Map<string, CartItemRecord>;
};

function identity(cart: MutableCart): CartIdentity {
  return {
    id: cart.id,
    status: cart.status,
    expiresAt: cart.expiresAt,
    version: cart.version,
  };
}

function toRecord(
  cart: MutableCart,
  currentVariants?: Map<string, CartVariantRecord>,
): CartRecord {
  return {
    ...identity(cart),
    items: [...cart.items.values()].map((item) => ({
      ...item,
      variant: currentVariants?.get(item.variantId) ?? item.variant,
    })),
  };
}
