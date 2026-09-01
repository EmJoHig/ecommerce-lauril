import { z } from "zod";
import { ConflictError, NotFoundError } from "@/shared/domain/errors";
import {
  assertCartLineCanBeSet,
  calculateCartItemCount,
  calculateCartSubtotal,
  calculateLineSubtotal,
  cartAvailabilityMessage,
  currentCartUnitPrice,
  getCartLineAvailability,
  validateCartQuantity,
  type CartLineAvailability,
  type CartVariantState,
} from "../domain/cart";
import type {
  CartRecord,
  CartRepository,
  CartVariantRecord,
} from "./cart-repository";

const tokenHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const mutationSchema = z.object({
  tokenHash: tokenHashSchema,
  variantId: z.uuid(),
  quantity: z.number(),
});

export type CartLineView = Readonly<{
  id: string;
  variantId: string;
  productId: string;
  productName: string;
  productSlug: string;
  variantName: string;
  sku: string;
  imageUrl: string | null;
  imageAlt: string;
  quantity: number;
  availableStock: number;
  unitPriceInCents: bigint;
  lineSubtotalInCents: bigint;
  priceChanged: boolean;
  availability: CartLineAvailability;
  availabilityMessage: string | null;
}>;

export type CartView = Readonly<{
  items: ReadonlyArray<CartLineView>;
  itemCount: number;
  subtotalInCents: bigint;
  hasIssues: boolean;
  expiresAt: Date | null;
  version: number;
}>;

export class CartService {
  constructor(
    private readonly repository: CartRepository,
    private readonly ttlDays = 30,
  ) {}

  async getCart(tokenHash: string | null, now = new Date()): Promise<CartView> {
    if (!tokenHash || !tokenHashSchema.safeParse(tokenHash).success) {
      return emptyCart();
    }
    const cart = await this.repository.findActiveByTokenHash(tokenHash, now);
    return cart ? mapCart(cart) : emptyCart();
  }

  async addItem(rawInput: {
    tokenHash: string;
    variantId: string;
    quantity: number;
  }, now = new Date()): Promise<CartView> {
    const input = mutationSchema.parse(rawInput);
    validateCartQuantity(input.quantity);
    const expiresAt = addDays(now, this.ttlDays);

    return this.repository.run(async (transaction) => {
      let cart = await transaction.findCartByTokenHash(input.tokenHash);
      if (!cart) {
        cart = await transaction.createCart({ tokenHash: input.tokenHash, expiresAt });
      } else if (cart.status !== "ACTIVE" || cart.expiresAt <= now) {
        if (cart.status === "CONVERTED") {
          throw new ConflictError("El carrito ya fue convertido y no puede modificarse.");
        }
        cart = await transaction.resetCart({ id: cart.id, expiresAt });
      }

      const variant = await requireVariant(transaction.findVariant(input.variantId));
      const existing = await transaction.findItem(cart.id, input.variantId);
      const quantity = validateCartQuantity((existing?.quantity ?? 0) + input.quantity);
      const state = variantState(variant);
      assertCartLineCanBeSet(state, quantity);
      await transaction.setItem({
        cartId: cart.id,
        variantId: variant.id,
        quantity,
        unitPriceSnapshotInCents: currentCartUnitPrice(state),
      });
      await transaction.touchCart(cart.id, expiresAt);
      return mapCart(await transaction.readCart(cart.id));
    });
  }

  async updateItemQuantity(rawInput: {
    tokenHash: string;
    variantId: string;
    quantity: number;
  }, now = new Date()): Promise<CartView> {
    const input = mutationSchema.parse(rawInput);
    const quantity = validateCartQuantity(input.quantity);
    const expiresAt = addDays(now, this.ttlDays);

    return this.repository.run(async (transaction) => {
      const cart = await requireActiveCart(
        transaction.findCartByTokenHash(input.tokenHash),
        now,
      );
      const existing = await transaction.findItem(cart.id, input.variantId);
      if (!existing) throw new NotFoundError("El artículo no pertenece a este carrito.");
      const variant = await requireVariant(transaction.findVariant(input.variantId));
      const state = variantState(variant);
      assertCartLineCanBeSet(state, quantity);
      await transaction.setItem({
        cartId: cart.id,
        variantId: variant.id,
        quantity,
        unitPriceSnapshotInCents: currentCartUnitPrice(state),
      });
      await transaction.touchCart(cart.id, expiresAt);
      return mapCart(await transaction.readCart(cart.id));
    });
  }

  async removeItem(
    tokenHash: string,
    variantId: string,
    now = new Date(),
  ): Promise<CartView> {
    const parsedTokenHash = tokenHashSchema.parse(tokenHash);
    const parsedVariantId = z.uuid().parse(variantId);
    const expiresAt = addDays(now, this.ttlDays);
    return this.repository.run(async (transaction) => {
      const cart = await requireActiveCart(
        transaction.findCartByTokenHash(parsedTokenHash),
        now,
      );
      if (!(await transaction.removeItem(cart.id, parsedVariantId))) {
        throw new NotFoundError("El artículo no pertenece a este carrito.");
      }
      await transaction.touchCart(cart.id, expiresAt);
      return mapCart(await transaction.readCart(cart.id));
    });
  }

  async clearCart(tokenHash: string, now = new Date()): Promise<CartView> {
    const parsedTokenHash = tokenHashSchema.parse(tokenHash);
    const expiresAt = addDays(now, this.ttlDays);
    return this.repository.run(async (transaction) => {
      const cart = await requireActiveCart(
        transaction.findCartByTokenHash(parsedTokenHash),
        now,
      );
      await transaction.clearItems(cart.id);
      await transaction.touchCart(cart.id, expiresAt);
      return mapCart(await transaction.readCart(cart.id));
    });
  }
}

function mapCart(cart: CartRecord): CartView {
  const items = cart.items.map((item): CartLineView => {
    const state = variantState(item.variant);
    const unitPriceInCents = currentCartUnitPrice(state);
    const availability = getCartLineAvailability(state, item.quantity);
    return {
      id: item.id,
      variantId: item.variantId,
      productId: item.variant.product.id,
      productName: item.variant.product.name,
      productSlug: item.variant.product.slug,
      variantName: item.variant.name,
      sku: item.variant.sku,
      imageUrl: item.variant.product.image?.url ?? null,
      imageAlt: item.variant.product.image?.altText ?? item.variant.product.name,
      quantity: item.quantity,
      availableStock: availability.availableStock,
      unitPriceInCents,
      lineSubtotalInCents: calculateLineSubtotal(unitPriceInCents, item.quantity),
      priceChanged: unitPriceInCents !== item.unitPriceSnapshotInCents,
      availability: availability.status,
      availabilityMessage: cartAvailabilityMessage(
        availability.status,
        availability.availableStock,
      ),
    };
  });
  return {
    items,
    itemCount: calculateCartItemCount(items.map(({ quantity }) => quantity)),
    subtotalInCents: calculateCartSubtotal(
      items.map(({ lineSubtotalInCents }) => lineSubtotalInCents),
    ),
    hasIssues: items.some(({ availability }) => availability !== "AVAILABLE"),
    expiresAt: cart.expiresAt,
    version: cart.version,
  };
}

function variantState(variant: CartVariantRecord): CartVariantState {
  return {
    productStatus: variant.product.status,
    variantActive: variant.isActive,
    priceInCents: variant.priceInCents,
    promotionalPriceInCents: variant.promotionalPriceInCents,
    stockOnHand: variant.inventory?.stockOnHand ?? 0,
    stockReserved: variant.inventory?.stockReserved ?? 0,
  };
}

async function requireVariant(
  result: Promise<CartVariantRecord | null>,
): Promise<CartVariantRecord> {
  const variant = await result;
  if (!variant) throw new NotFoundError("No se encontró la variante seleccionada.");
  return variant;
}

async function requireActiveCart(
  result: Promise<Readonly<{ id: string; status: string; expiresAt: Date }> | null>,
  now: Date,
) {
  const cart = await result;
  if (!cart || cart.status !== "ACTIVE" || cart.expiresAt <= now) {
    throw new NotFoundError("El carrito ya no está disponible.");
  }
  return cart;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function emptyCart(): CartView {
  return {
    items: [],
    itemCount: 0,
    subtotalInCents: 0n,
    hasIssues: false,
    expiresAt: null,
    version: 0,
  };
}
