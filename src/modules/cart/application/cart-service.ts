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
const customerMutationSchema = z.object({
  customerId: z.uuid(),
  variantId: z.uuid(),
  quantity: z.number(),
});

type CartOwner =
  | Readonly<{ kind: "guest"; tokenHash: string }>
  | Readonly<{ kind: "customer"; customerId: string }>;

export type CartMergeResult = Readonly<{
  cart: CartView;
  merged: boolean;
  adjustedLines: number;
  removedLines: number;
}>;

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

  async getCustomerCart(customerId: string, now = new Date()): Promise<CartView> {
    const id = z.uuid().parse(customerId);
    const cart = await this.repository.findActiveByCustomerId(id, now);
    return cart ? mapCart(cart) : emptyCart();
  }

  async addItem(rawInput: {
    tokenHash: string;
    variantId: string;
    quantity: number;
  }, now = new Date()): Promise<CartView> {
    const input = mutationSchema.parse(rawInput);
    return this.addForOwner(
      { kind: "guest", tokenHash: input.tokenHash },
      input.variantId,
      input.quantity,
      now,
    );
  }

  async addCustomerItem(rawInput: {
    customerId: string;
    variantId: string;
    quantity: number;
  }, now = new Date()): Promise<CartView> {
    const input = customerMutationSchema.parse(rawInput);
    return this.addForOwner(
      { kind: "customer", customerId: input.customerId },
      input.variantId,
      input.quantity,
      now,
    );
  }

  private async addForOwner(owner: CartOwner, variantId: string, rawQuantity: number, now: Date): Promise<CartView> {
    const quantityToAdd = validateCartQuantity(rawQuantity);
    const expiresAt = addDays(now, this.ttlDays);

    return this.repository.run(async (transaction) => {
      let cart = await findOwnerCart(transaction, owner);
      if (!cart) {
        cart = await transaction.createCart({
          tokenHash: owner.kind === "guest" ? owner.tokenHash : null,
          customerId: owner.kind === "customer" ? owner.customerId : null,
          expiresAt,
        });
      } else if (cart.status !== "ACTIVE" || cart.expiresAt <= now) {
        if (cart.status === "CONVERTED") {
          throw new ConflictError("El carrito ya fue convertido y no puede modificarse.");
        }
        cart = await transaction.resetCart({ id: cart.id, expiresAt });
      }

      const variant = await requireVariant(transaction.findVariant(variantId));
      const existing = await transaction.findItem(cart.id, variantId);
      const quantity = validateCartQuantity((existing?.quantity ?? 0) + quantityToAdd);
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
    return this.updateForOwner(
      { kind: "guest", tokenHash: input.tokenHash },
      input.variantId,
      input.quantity,
      now,
    );
  }

  async updateCustomerItemQuantity(rawInput: {
    customerId: string;
    variantId: string;
    quantity: number;
  }, now = new Date()): Promise<CartView> {
    const input = customerMutationSchema.parse(rawInput);
    return this.updateForOwner(
      { kind: "customer", customerId: input.customerId },
      input.variantId,
      input.quantity,
      now,
    );
  }

  private async updateForOwner(owner: CartOwner, variantId: string, rawQuantity: number, now: Date): Promise<CartView> {
    const quantity = validateCartQuantity(rawQuantity);
    const expiresAt = addDays(now, this.ttlDays);

    return this.repository.run(async (transaction) => {
      const cart = await requireActiveCart(
        findOwnerCart(transaction, owner),
        now,
      );
      const existing = await transaction.findItem(cart.id, variantId);
      if (!existing) throw new NotFoundError("El artículo no pertenece a este carrito.");
      const variant = await requireVariant(transaction.findVariant(variantId));
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
    return this.removeForOwner(
      { kind: "guest", tokenHash: parsedTokenHash },
      parsedVariantId,
      now,
    );
  }

  async removeCustomerItem(customerId: string, variantId: string, now = new Date()): Promise<CartView> {
    return this.removeForOwner(
      { kind: "customer", customerId: z.uuid().parse(customerId) },
      z.uuid().parse(variantId),
      now,
    );
  }

  private async removeForOwner(owner: CartOwner, variantId: string, now: Date): Promise<CartView> {
    const expiresAt = addDays(now, this.ttlDays);
    return this.repository.run(async (transaction) => {
      const cart = await requireActiveCart(
        findOwnerCart(transaction, owner),
        now,
      );
      if (!(await transaction.removeItem(cart.id, variantId))) {
        throw new NotFoundError("El artículo no pertenece a este carrito.");
      }
      await transaction.touchCart(cart.id, expiresAt);
      return mapCart(await transaction.readCart(cart.id));
    });
  }

  async clearCart(tokenHash: string, now = new Date()): Promise<CartView> {
    const parsedTokenHash = tokenHashSchema.parse(tokenHash);
    return this.clearForOwner({ kind: "guest", tokenHash: parsedTokenHash }, now);
  }

  async clearCustomerCart(customerId: string, now = new Date()): Promise<CartView> {
    return this.clearForOwner(
      { kind: "customer", customerId: z.uuid().parse(customerId) },
      now,
    );
  }

  private async clearForOwner(owner: CartOwner, now: Date): Promise<CartView> {
    const expiresAt = addDays(now, this.ttlDays);
    return this.repository.run(async (transaction) => {
      const cart = await requireActiveCart(
        findOwnerCart(transaction, owner),
        now,
      );
      await transaction.clearItems(cart.id);
      await transaction.touchCart(cart.id, expiresAt);
      return mapCart(await transaction.readCart(cart.id));
    });
  }

  async mergeGuestCart(
    customerIdInput: string,
    guestTokenHash: string | null,
    now = new Date(),
  ): Promise<CartMergeResult> {
    const customerId = z.uuid().parse(customerIdInput);
    const tokenHash = guestTokenHash ? tokenHashSchema.parse(guestTokenHash) : null;
    const expiresAt = addDays(now, this.ttlDays);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.repository.run(async (transaction) => {
          const guest = tokenHash
            ? await transaction.findCartByTokenHash(tokenHash)
            : null;
          let target = await transaction.findActiveCartByCustomerId(customerId);
          const validGuest = guest?.status === "ACTIVE" && guest.expiresAt > now
            ? guest
            : null;

          if (!target && validGuest) {
            target = await transaction.assignCartToCustomer({
              cartId: validGuest.id,
              customerId,
              expiresAt,
            });
          } else if (!target) {
            return {
              cart: emptyCart(),
              merged: false,
              adjustedLines: 0,
              removedLines: 0,
            };
          } else if (target.expiresAt <= now) {
            target = await transaction.resetCart({ id: target.id, expiresAt });
          }

          const targetBefore = await transaction.readCart(target.id);
          const source = validGuest && validGuest.id !== target.id
            ? await transaction.readCart(validGuest.id)
            : null;
          const quantities = new Map<string, number>();
          for (const item of targetBefore.items) {
            quantities.set(item.variantId, item.quantity);
          }
          for (const item of source?.items ?? []) {
            quantities.set(
              item.variantId,
              (quantities.get(item.variantId) ?? 0) + item.quantity,
            );
          }

          let adjustedLines = 0;
          let removedLines = 0;
          for (const [variantId, requested] of quantities) {
            const variant = await transaction.findVariant(variantId);
            if (!variant) {
              await transaction.removeItem(target.id, variantId);
              removedLines += 1;
              continue;
            }
            const state = variantState(variant);
            const availability = getCartLineAvailability(state, 1);
            if (availability.status !== "AVAILABLE") {
              await transaction.removeItem(target.id, variantId);
              removedLines += 1;
              continue;
            }
            const quantity = Math.min(requested, availability.availableStock, 999);
            if (quantity !== requested) adjustedLines += 1;
            await transaction.setItem({
              cartId: target.id,
              variantId,
              quantity,
              unitPriceSnapshotInCents: currentCartUnitPrice(state),
            });
          }

          if (source) {
            await transaction.clearItems(source.id);
            await transaction.abandonCart(source.id, now);
          }
          await transaction.touchCart(target.id, expiresAt);
          return {
            cart: mapCart(await transaction.readCart(target.id)),
            merged: Boolean(validGuest),
            adjustedLines,
            removedLines,
          };
        });
      } catch (error) {
        if (!(error instanceof ConflictError) || attempt === 2) throw error;
      }
    }
    throw new ConflictError("No se pudo fusionar el carrito después de varios intentos.");
  }
}

function findOwnerCart(transaction: import("./cart-repository").CartTransaction, owner: CartOwner) {
  return owner.kind === "guest"
    ? transaction.findCartByTokenHash(owner.tokenHash)
    : transaction.findActiveCartByCustomerId(owner.customerId);
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
