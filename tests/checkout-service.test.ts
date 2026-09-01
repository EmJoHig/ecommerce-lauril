import { describe, expect, it } from "vitest";
import { CheckoutService } from "@/modules/orders/application/checkout-service";
import type { CheckoutCartRecord, CheckoutOwner, CheckoutTransaction, CreateOrderRecordInput, OrderRepository, OrderView, PendingOrderRecord } from "@/modules/orders/application/order-repository";
import { CustomShippingProvider } from "@/modules/shipping/application/custom-shipping-provider";
import type { ShippingMethodState } from "@/modules/shipping/domain/shipping";
import { NotFoundError, ValidationError } from "@/shared/domain/errors";

const ids = {
  cart: "10000000-0000-4000-8000-000000000001", customer: "10000000-0000-4000-8000-000000000002",
  user: "10000000-0000-4000-8000-000000000003", product: "10000000-0000-4000-8000-000000000004",
  variant: "10000000-0000-4000-8000-000000000005", inventory: "10000000-0000-4000-8000-000000000006",
  shipping: "10000000-0000-4000-8000-000000000007", address: "10000000-0000-4000-8000-000000000008",
  order: "10000000-0000-4000-8000-000000000009",
};
const checkoutKey = "A".repeat(43);
const guestHash = "a".repeat(64);
const now = new Date("2026-09-01T12:00:00.000Z");

function shipping(overrides: Partial<ShippingMethodState> = {}): ShippingMethodState {
  return { id: ids.shipping, code: "ENVIO_FIJO", name: "Envío fijo", description: null, type: "FLAT_RATE", costInCents: 450000n, requiresAddress: true, minimumSubtotalInCents: null, freeShippingFromInCents: null, isActive: true, sortOrder: 1, ...overrides };
}

function cart(overrides: Partial<CheckoutCartRecord> = {}): CheckoutCartRecord {
  return { id: ids.cart, status: "ACTIVE", expiresAt: new Date("2026-09-02T12:00:00.000Z"), guestTokenHash: guestHash, customerId: null, items: [{ quantity: 2, variant: { id: ids.variant, sku: "SKU-001", name: "Única", isActive: true, priceInCents: 410000n, promotionalPriceInCents: null, product: { id: ids.product, name: "Producto", status: "ACTIVE" }, inventory: { id: ids.inventory, stockOnHand: 10, stockReserved: 1, version: 0 } } }], ...overrides };
}

class MemoryRepository implements OrderRepository {
  cart = cart();
  method = shipping();
  saved: OrderView | null = null;
  reserved = 1;
  converted = false;
  released = false;
  pending: PendingOrderRecord | null = null;

  findCheckoutCart(owner: CheckoutOwner) { return Promise.resolve(matchesOwner(this.cart, owner) ? this.cart : null); }
  findCustomer(customerId: string) { return Promise.resolve(customerId === ids.customer ? { id: ids.customer, userId: ids.user, firstName: "Cliente", lastName: "Prueba", email: "cliente@test.local", phone: "+54 11 5555-0000", status: "ACTIVE" as const, userStatus: "ACTIVE" as const } : null); }
  listCustomerAddresses(customerId: string) { return Promise.resolve(customerId === ids.customer ? [{ id: ids.address, customerId: ids.customer, label: "Casa", recipientFirstName: "Cliente", recipientLastName: "Prueba", phone: "+54 11 5555-0000", street: "Calle", streetNumber: "123", floorApartment: null, city: "CABA", province: "Buenos Aires", postalCode: "1000", references: null, isDefault: true }] : []); }
  findPublicOrder(number: bigint, owner: { customerId: string | null; guestTokenHash: string | null }) { return Promise.resolve(this.saved?.number === number && (this.saved.customerId === owner.customerId || this.saved.guestAccessTokenHash === owner.guestTokenHash) ? this.saved : null); }
  listAdminOrders() { return Promise.resolve([]); }
  findAdminOrder(id: string) { return Promise.resolve(this.saved?.id === id ? this.saved : null); }
  listExpiredPendingOrderIds() { return Promise.resolve(this.pending ? [this.pending.id] : []); }
  run<T>(work: (transaction: CheckoutTransaction) => Promise<T>): Promise<T> { return work(this.transaction()); }

  private transaction(): CheckoutTransaction {
    return {
      findOrderByCheckoutKey: async () => this.saved,
      findCart: async (owner) => matchesOwner(this.cart, owner) ? this.cart : null,
      findCustomer: async (customerId) => this.findCustomer(customerId),
      findAddress: async (customerId, addressId) => (await this.listCustomerAddresses(customerId)).find((item) => item.id === addressId) ?? null,
      findShippingMethod: async (methodId) => methodId === this.method.id ? this.method : null,
      reserveInventory: async (input) => { this.reserved = input.stockReserved; return true; },
      createOrder: async (input) => { this.saved = makeOrder(input); return this.saved; },
      convertCart: async () => { this.converted = true; this.cart = { ...this.cart, status: "CONVERTED" }; return true; },
      findPendingOrder: async () => this.pending,
      releaseInventory: async (input) => { this.released = true; this.reserved = input.stockReserved; return true; },
      cancelExpiredOrder: async () => { if (!this.pending) return false; this.pending = { ...this.pending, status: "CANCELLED", reservationReleasedAt: now }; return true; },
    };
  }
}

function service(repository = new MemoryRepository()) {
  const provider = new CustomShippingProvider({ listActive: async () => [repository.method], findActiveById: async () => repository.method });
  return { repository, checkout: new CheckoutService(repository, provider, 15) };
}

describe("checkout", () => {
  it("prepara precios y totales actuales desde servidor", async () => {
    const { checkout } = service();
    const result = await checkout.prepare({ kind: "guest", tokenHash: guestHash }, now);
    expect(result.items[0]).toMatchObject({ unitPriceInCents: 410000n, subtotalInCents: 820000n });
    expect(result.shippingQuotes[0]?.totalInCents).toBe(1270000n);
  });

  it("crea checkout invitado con snapshot, reserva y convierte carrito", async () => {
    const { checkout, repository } = service();
    const result = await checkout.confirm(guestInput(), now);
    expect(result.order).toMatchObject({ customerId: null, buyerEmail: "guest@test.local", status: "PENDING_PAYMENT", totalInCents: 1270000n });
    expect(result.order.items[0]).toMatchObject({ sku: "SKU-001", unitPriceInCents: 410000n, quantity: 2, subtotalInCents: 820000n });
    expect(repository.reserved).toBe(3);
    expect(repository.converted).toBe(true);
  });

  it("crea checkout cliente usando perfil y dirección propia", async () => {
    const { checkout, repository } = service();
    repository.cart = { ...repository.cart, customerId: ids.customer, guestTokenHash: null };
    const result = await checkout.confirm({ owner: { kind: "customer", customerId: ids.customer }, checkoutKey, shippingMethodId: ids.shipping, savedAddressId: ids.address }, now);
    expect(result.order).toMatchObject({ customerId: ids.customer, buyerEmail: "cliente@test.local", shippingStreet: "Calle" });
  });

  it("rechaza carrito vacío, producto inactivo y variante inactiva", async () => {
    const first = service(); first.repository.cart = { ...first.repository.cart, items: [] };
    await expect(first.checkout.prepare({ kind: "guest", tokenHash: guestHash }, now)).rejects.toThrow("vacío");
    const second = service(); second.repository.cart = withVariant(second.repository.cart, { product: { id: ids.product, name: "Producto", status: "INACTIVE" } });
    await expect(second.checkout.confirm(guestInput(), now)).rejects.toThrow(ValidationError);
    const third = service(); third.repository.cart = withVariant(third.repository.cart, { isActive: false });
    await expect(third.checkout.confirm(guestInput(), now)).rejects.toThrow(ValidationError);
  });

  it("recalcula un precio modificado antes del snapshot", async () => {
    const { checkout, repository } = service();
    repository.cart = withVariant(repository.cart, { priceInCents: 500001n });
    expect((await checkout.confirm(guestInput(), now)).order.items[0]?.unitPriceInCents).toBe(500001n);
  });

  it("rechaza stock insuficiente", async () => {
    const { checkout, repository } = service();
    repository.cart = withVariant(repository.cart, { inventory: { id: ids.inventory, stockOnHand: 2, stockReserved: 1, version: 0 } });
    await expect(checkout.confirm(guestInput(), now)).rejects.toThrow(ValidationError);
  });

  it("exige dirección para envío y permite pickup sin dirección", async () => {
    const first = service();
    await expect(first.checkout.confirm({ ...guestInput(), newAddress: null }, now)).rejects.toThrow("dirección");
    const second = service(); second.repository.method = shipping({ type: "PICKUP", code: "RETIRO", name: "Retiro", costInCents: 0n, requiresAddress: false });
    const result = await second.checkout.confirm({ ...guestInput(), newAddress: null }, now);
    expect(result.order.shippingStreet).toBeNull();
    expect(result.order.totalInCents).toBe(820000n);
  });

  it("es idempotente para la misma clave", async () => {
    const { checkout, repository } = service();
    const first = await checkout.confirm(guestInput(), now);
    const second = await checkout.confirm(guestInput(), now);
    expect(second.reused).toBe(true);
    expect(second.order.id).toBe(first.order.id);
    expect(repository.reserved).toBe(3);
  });

  it("impide reutilizar la clave desde otro propietario", async () => {
    const { checkout, repository } = service();
    await checkout.confirm(guestInput(), now);
    repository.cart = { ...cart(), guestTokenHash: "b".repeat(64) };
    await expect(checkout.confirm({ ...guestInput(), owner: { kind: "guest", tokenHash: "b".repeat(64) } }, now)).rejects.toThrow(NotFoundError);
  });

  it("expira y libera la reserva una sola vez", async () => {
    const { checkout, repository } = service();
    repository.pending = { id: ids.order, status: "PENDING_PAYMENT", paymentExpiresAt: new Date(now.getTime() - 1), reservationReleasedAt: null, reservations: [{ quantity: 2, inventory: { id: ids.inventory, stockOnHand: 10, stockReserved: 3, version: 1 } }] };
    expect(await checkout.expirePendingOrder(ids.order, now)).toBe(true);
    expect(repository.released).toBe(true);
    expect(repository.reserved).toBe(1);
    expect(await checkout.expirePendingOrder(ids.order, now)).toBe(false);
  });
});

function guestInput() {
  return { owner: { kind: "guest" as const, tokenHash: guestHash }, checkoutKey, shippingMethodId: ids.shipping, guestBuyer: { firstName: "Guest", lastName: "Prueba", email: "GUEST@TEST.LOCAL", phone: "+54 11 5555-0000" }, newAddress: { label: "Checkout", recipientFirstName: "Guest", recipientLastName: "Prueba", phone: "+54 11 5555-0000", street: "Calle", streetNumber: "123", city: "CABA", province: "Buenos Aires", postalCode: "1000", isDefault: false } };
}

function withVariant(value: CheckoutCartRecord, overrides: Partial<CheckoutCartRecord["items"][number]["variant"]>): CheckoutCartRecord {
  const item = value.items[0]!;
  return { ...value, items: [{ ...item, variant: { ...item.variant, ...overrides } }] };
}

function matchesOwner(value: CheckoutCartRecord, owner: CheckoutOwner) {
  return owner.kind === "guest" ? value.guestTokenHash === owner.tokenHash : value.customerId === owner.customerId;
}

function makeOrder(input: CreateOrderRecordInput): OrderView {
  return { id: ids.order, number: 10001n, cartId: input.cartId, customerId: input.customerId, guestAccessTokenHash: input.guestAccessTokenHash, status: "PENDING_PAYMENT", buyerFirstName: input.buyer.firstName, buyerLastName: input.buyer.lastName, buyerEmail: input.buyer.email, buyerPhone: input.buyer.phone, shippingMethodName: input.shipping.methodName, shippingMethodType: input.shipping.methodType, shippingRequiresAddress: input.shipping.requiresAddress, shippingRecipientFirstName: input.shipping.recipientFirstName, shippingRecipientLastName: input.shipping.recipientLastName, shippingPhone: input.shipping.phone, shippingStreet: input.shipping.street, shippingStreetNumber: input.shipping.streetNumber, shippingFloorApartment: input.shipping.floorApartment, shippingCity: input.shipping.city, shippingProvince: input.shipping.province, shippingPostalCode: input.shipping.postalCode, shippingReferences: input.shipping.references, ...input.totals, paymentExpiresAt: input.paymentExpiresAt, reservationReleasedAt: null, createdAt: now, items: input.items, history: [{ fromStatus: null, toStatus: "PENDING_PAYMENT", reason: "Creado", createdAt: now }] };
}
