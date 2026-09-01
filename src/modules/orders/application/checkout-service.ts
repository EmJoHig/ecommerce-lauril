import { z } from "zod";
import { assertCartLineCanBeSet, currentCartUnitPrice } from "@/modules/cart/domain/cart";
import type { CustomerAddressInput } from "@/modules/customers/domain/customer";
import { calculateReservation, calculateReservationRelease } from "@/modules/inventory/domain/inventory";
import { quoteShippingMethod, type ShippingQuote } from "@/modules/shipping/domain/shipping";
import type { ShippingProvider } from "@/modules/shipping/application/shipping-provider";
import { ConflictError, NotFoundError, ValidationError } from "@/shared/domain/errors";
import { calculateOrderLine, calculateOrderTotals, normalizeBuyerSnapshot, normalizeOrderAddress, validateId } from "../domain/order";
import { hashCheckoutKey } from "../domain/checkout-key";
import type { CheckoutAddressRecord, CheckoutCartRecord, CheckoutOwner, OrderItemView, OrderRepository, OrderView } from "./order-repository";

export type CheckoutPreparation = Readonly<{
  buyer: Readonly<{ firstName: string; lastName: string; email: string; phone: string }> | null;
  addresses: ReadonlyArray<CheckoutAddressRecord>;
  items: ReadonlyArray<OrderItemView>;
  shippingQuotes: ReadonlyArray<ShippingQuote & Readonly<{ totalInCents: bigint }>>;
  itemsSubtotalInCents: bigint;
}>;

export type ConfirmCheckoutInput = Readonly<{
  owner: CheckoutOwner;
  checkoutKey: string;
  shippingMethodId: string;
  guestBuyer?: Readonly<{ firstName: string; lastName: string; email: string; phone: string }>;
  savedAddressId?: string | null;
  newAddress?: CustomerAddressInput | null;
}>;

export type ConfirmCheckoutResult = Readonly<{ order: OrderView; reused: boolean }>;

export class CheckoutService {
  constructor(
    private readonly repository: OrderRepository,
    private readonly shippingProvider: ShippingProvider,
    private readonly reservationMinutes = 15,
  ) {}

  async prepare(owner: CheckoutOwner, now = new Date()): Promise<CheckoutPreparation> {
    const cart = await this.repository.findCheckoutCart(validateOwner(owner), now);
    if (!cart || cart.items.length === 0) throw new ValidationError("El carrito está vacío.");
    const itemsSubtotalInCents = validateCartAndSubtotal(cart);
    const customer = owner.kind === "customer"
      ? await this.repository.findCustomer(owner.customerId)
      : null;
    if (owner.kind === "customer" && (!customer || customer.status !== "ACTIVE" || customer.userStatus !== "ACTIVE")) {
      throw new NotFoundError("No se encontró la cuenta activa.");
    }
    const items = checkoutItems(cart);
    const shippingQuotes = await this.shippingProvider.quoteAll(itemsSubtotalInCents);
    return {
      buyer: customer ? normalizeBuyerSnapshot(customer) : null,
      addresses: customer ? await this.repository.listCustomerAddresses(customer.id) : [],
      items: items.map(toOrderItemView),
      shippingQuotes: shippingQuotes.map((quote) => ({
        ...quote,
        totalInCents: calculateOrderTotals({
          lineSubtotalsInCents: items.map(({ subtotalInCents }) => subtotalInCents),
          shippingAmountInCents: quote.amountInCents,
        }).totalInCents,
      })),
      itemsSubtotalInCents,
    };
  }

  async confirm(input: ConfirmCheckoutInput, now = new Date()): Promise<ConfirmCheckoutResult> {
    const owner = validateOwner(input.owner);
    const checkoutKeyHash = hashCheckoutKey(input.checkoutKey);
    const shippingMethodId = validateId(input.shippingMethodId);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.repository.run(async (transaction) => {
          const existing = await transaction.findOrderByCheckoutKey(checkoutKeyHash);
          if (existing) {
            assertOrderOwner(existing, owner);
            return { order: existing, reused: true };
          }

          const cart = await transaction.findCart(owner);
          if (!cart || cart.status !== "ACTIVE" || cart.expiresAt <= now || cart.items.length === 0) {
            throw new ValidationError("El carrito está vacío o ya fue convertido.");
          }
          const customer = owner.kind === "customer"
            ? await transaction.findCustomer(owner.customerId)
            : null;
          if (owner.kind === "customer" && (!customer || customer.status !== "ACTIVE" || customer.userStatus !== "ACTIVE")) {
            throw new NotFoundError("No se encontró la cuenta activa.");
          }
          const buyer = customer
            ? normalizeBuyerSnapshot(customer)
            : normalizeBuyerSnapshot(input.guestBuyer ?? missingGuestBuyer());

          const items = checkoutItems(cart);
          const itemsSubtotalInCents = calculateOrderTotals({
            lineSubtotalsInCents: items.map(({ subtotalInCents }) => subtotalInCents),
            shippingAmountInCents: 0n,
          }).itemsSubtotalInCents;
          const method = await transaction.findShippingMethod(shippingMethodId);
          const quote = method ? quoteShippingMethod(method, itemsSubtotalInCents) : null;
          if (!quote) throw new ValidationError("El método de entrega ya no está disponible.");
          const address = quote.requiresAddress
            ? await resolveAddress(transaction, owner, input)
            : null;
          const totals = calculateOrderTotals({
            lineSubtotalsInCents: items.map(({ subtotalInCents }) => subtotalInCents),
            shippingAmountInCents: quote.amountInCents,
          });

          for (const item of items) {
            const stockReserved = calculateReservation(
              item.inventory.stockOnHand,
              item.inventory.stockReserved,
              item.quantity,
            );
            if (!(await transaction.reserveInventory({
              id: item.inventory.id,
              expectedVersion: item.inventory.version,
              stockReserved,
            }))) throw new ConflictError("El stock cambió durante la confirmación.");
          }

          const order = await transaction.createOrder({
            cartId: cart.id,
            customerId: owner.kind === "customer" ? owner.customerId : null,
            shippingMethodId: quote.methodId,
            checkoutKeyHash,
            guestAccessTokenHash: owner.kind === "guest" ? owner.tokenHash : null,
            buyer,
            shipping: {
              methodName: quote.name,
              methodType: quote.type,
              requiresAddress: quote.requiresAddress,
              recipientFirstName: address?.recipientFirstName ?? null,
              recipientLastName: address?.recipientLastName ?? null,
              phone: address?.phone ?? null,
              street: address?.street ?? null,
              streetNumber: address?.streetNumber ?? null,
              floorApartment: address?.floorApartment ?? null,
              city: address?.city ?? null,
              province: address?.province ?? null,
              postalCode: address?.postalCode ?? null,
              references: address?.references ?? null,
            },
            totals,
            paymentExpiresAt: new Date(now.getTime() + this.reservationMinutes * 60_000),
            items: items.map(toCreateOrderItem),
          });
          if (!(await transaction.convertCart(cart.id, now))) {
            throw new ConflictError("El carrito cambió durante la confirmación.");
          }
          return { order, reused: false };
        });
      } catch (error) {
        if (error instanceof ConflictError) {
          if (attempt < 2) continue;
        }
        throw error;
      }
    }
    throw new ConflictError("No se pudo confirmar el pedido después de varios intentos.");
  }

  async expirePendingOrders(now = new Date(), limit = 100): Promise<number> {
    const ids = await this.repository.listExpiredPendingOrderIds(now, limit);
    let expired = 0;
    for (const id of ids) {
      if (await this.expirePendingOrder(id, now)) expired += 1;
    }
    return expired;
  }

  async expirePendingOrder(orderId: string, now = new Date()): Promise<boolean> {
    const id = validateId(orderId);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.repository.run(async (transaction) => {
          const order = await transaction.findPendingOrder(id);
          if (!order || order.status !== "PENDING_PAYMENT" || order.reservationReleasedAt) return false;
          if (order.paymentExpiresAt > now) return false;
          for (const reservation of order.reservations) {
            if (!reservation.inventory) throw new ConflictError("No se encontró el inventario reservado.");
            const stockReserved = calculateReservationRelease(
              reservation.inventory.stockOnHand,
              reservation.inventory.stockReserved,
              reservation.quantity,
            );
            if (!(await transaction.releaseInventory({
              id: reservation.inventory.id,
              expectedVersion: reservation.inventory.version,
              stockReserved,
            }))) throw new ConflictError("El inventario cambió durante la liberación.");
          }
          return transaction.cancelExpiredOrder(id, now);
        });
      } catch (error) {
        if (!(error instanceof ConflictError) || attempt === 2) throw error;
      }
    }
    return false;
  }
}

function validateOwner(owner: CheckoutOwner): CheckoutOwner {
  return owner.kind === "customer"
    ? { kind: "customer", customerId: z.uuid().parse(owner.customerId) }
    : { kind: "guest", tokenHash: z.string().regex(/^[a-f0-9]{64}$/).parse(owner.tokenHash) };
}

function validateCartAndSubtotal(cart: CheckoutCartRecord): bigint {
  return calculateOrderTotals({
    lineSubtotalsInCents: checkoutItems(cart).map(({ subtotalInCents }) => subtotalInCents),
    shippingAmountInCents: 0n,
  }).itemsSubtotalInCents;
}

function checkoutItems(cart: CheckoutCartRecord) {
  return cart.items.map(({ quantity, variant }) => {
    if (!variant.inventory) throw new ValidationError(`La variante ${variant.sku} no posee inventario.`);
    const state = {
      productStatus: variant.product.status,
      variantActive: variant.isActive,
      priceInCents: variant.priceInCents,
      promotionalPriceInCents: variant.promotionalPriceInCents,
      stockOnHand: variant.inventory.stockOnHand,
      stockReserved: variant.inventory.stockReserved,
    } as const;
    assertCartLineCanBeSet(state, quantity);
    const unitPriceInCents = currentCartUnitPrice(state);
    return {
      productId: variant.product.id,
      productVariantId: variant.id,
      productName: variant.product.name,
      variantName: variant.name,
      sku: variant.sku,
      unitPriceInCents,
      quantity,
      subtotalInCents: calculateOrderLine(unitPriceInCents, quantity),
      inventory: variant.inventory,
    };
  });
}

function toOrderItemView(item: ReturnType<typeof checkoutItems>[number]) {
  return {
    productName: item.productName,
    variantName: item.variantName,
    sku: item.sku,
    unitPriceInCents: item.unitPriceInCents,
    quantity: item.quantity,
    subtotalInCents: item.subtotalInCents,
  };
}

function toCreateOrderItem(item: ReturnType<typeof checkoutItems>[number]) {
  return {
    productId: item.productId,
    productVariantId: item.productVariantId,
    ...toOrderItemView(item),
  };
}

async function resolveAddress(
  transaction: Parameters<Parameters<OrderRepository["run"]>[0]>[0],
  owner: CheckoutOwner,
  input: ConfirmCheckoutInput,
) {
  if (input.savedAddressId) {
    if (owner.kind !== "customer") throw new ValidationError("La dirección guardada no es válida.");
    const address = await transaction.findAddress(owner.customerId, validateId(input.savedAddressId));
    if (!address) throw new NotFoundError("No se encontró la dirección seleccionada.");
    return address;
  }
  if (!input.newAddress) throw new ValidationError("Ingresá una dirección de entrega.");
  return normalizeOrderAddress(input.newAddress);
}

function missingGuestBuyer(): never {
  throw new ValidationError("Completá los datos del comprador.");
}

function assertOrderOwner(order: OrderView, owner: CheckoutOwner): void {
  const matches = owner.kind === "customer"
    ? order.customerId === owner.customerId
    : order.guestAccessTokenHash === owner.tokenHash;
  if (!matches) throw new NotFoundError("No se encontró el pedido.");
}
