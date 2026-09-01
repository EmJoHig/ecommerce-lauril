import type { CustomerAddressInput } from "@/modules/customers/domain/customer";
import type { ShippingMethodState, ShippingMethodType } from "@/modules/shipping/domain/shipping";
import type { OrderStatusValue } from "../domain/order";

export type CheckoutOwner =
  | Readonly<{ kind: "guest"; tokenHash: string }>
  | Readonly<{ kind: "customer"; customerId: string }>;

export type CheckoutVariantRecord = Readonly<{
  id: string;
  sku: string;
  name: string;
  isActive: boolean;
  priceInCents: bigint;
  promotionalPriceInCents: bigint | null;
  product: Readonly<{ id: string; name: string; status: "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED" }>;
  inventory: Readonly<{ id: string; stockOnHand: number; stockReserved: number; version: number }> | null;
}>;

export type CheckoutCartRecord = Readonly<{
  id: string;
  status: "ACTIVE" | "CONVERTED" | "ABANDONED";
  expiresAt: Date;
  guestTokenHash: string | null;
  customerId: string | null;
  items: ReadonlyArray<Readonly<{ quantity: number; variant: CheckoutVariantRecord }>>;
}>;

export type CheckoutCustomerRecord = Readonly<{
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  status: "ACTIVE" | "DISABLED";
  userStatus: "ACTIVE" | "INVITED" | "DISABLED";
}>;

export type CheckoutAddressRecord = CustomerAddressInput & Readonly<{
  id: string;
  customerId: string;
  isDefault: boolean;
}>;

export type OrderItemView = Readonly<{
  productName: string;
  variantName: string;
  sku: string;
  unitPriceInCents: bigint;
  quantity: number;
  subtotalInCents: bigint;
}>;

export type OrderView = Readonly<{
  id: string;
  number: bigint;
  cartId: string;
  customerId: string | null;
  guestAccessTokenHash: string | null;
  status: OrderStatusValue;
  buyerFirstName: string;
  buyerLastName: string;
  buyerEmail: string;
  buyerPhone: string;
  shippingMethodName: string;
  shippingMethodType: ShippingMethodType;
  shippingRequiresAddress: boolean;
  shippingRecipientFirstName: string | null;
  shippingRecipientLastName: string | null;
  shippingPhone: string | null;
  shippingStreet: string | null;
  shippingStreetNumber: string | null;
  shippingFloorApartment: string | null;
  shippingCity: string | null;
  shippingProvince: string | null;
  shippingPostalCode: string | null;
  shippingReferences: string | null;
  itemsSubtotalInCents: bigint;
  shippingAmountInCents: bigint;
  discountAmountInCents: bigint;
  totalInCents: bigint;
  paymentExpiresAt: Date;
  reservationReleasedAt: Date | null;
  createdAt: Date;
  items: ReadonlyArray<OrderItemView>;
  history: ReadonlyArray<Readonly<{
    fromStatus: OrderStatusValue | null;
    toStatus: OrderStatusValue;
    reason: string;
    createdAt: Date;
  }>>;
}>;

export type AdminOrderRow = Readonly<{
  id: string;
  number: bigint;
  buyerName: string;
  buyerEmail: string;
  customerId: string | null;
  status: OrderStatusValue;
  itemsSubtotalInCents: bigint;
  shippingAmountInCents: bigint;
  totalInCents: bigint;
  paymentExpiresAt: Date;
  createdAt: Date;
}>;

export interface CheckoutTransaction {
  findOrderByCheckoutKey(checkoutKeyHash: string): Promise<OrderView | null>;
  findCart(owner: CheckoutOwner): Promise<CheckoutCartRecord | null>;
  findCustomer(customerId: string): Promise<CheckoutCustomerRecord | null>;
  findAddress(customerId: string, addressId: string): Promise<CheckoutAddressRecord | null>;
  findShippingMethod(methodId: string): Promise<ShippingMethodState | null>;
  reserveInventory(input: { id: string; expectedVersion: number; stockReserved: number }): Promise<boolean>;
  createOrder(input: CreateOrderRecordInput): Promise<OrderView>;
  convertCart(cartId: string, convertedAt: Date): Promise<boolean>;
  findPendingOrder(orderId: string): Promise<PendingOrderRecord | null>;
  releaseInventory(input: { id: string; expectedVersion: number; stockReserved: number }): Promise<boolean>;
  cancelExpiredOrder(orderId: string, expiredAt: Date): Promise<boolean>;
}

export type CreateOrderRecordInput = Readonly<{
  cartId: string;
  customerId: string | null;
  shippingMethodId: string;
  checkoutKeyHash: string;
  guestAccessTokenHash: string | null;
  buyer: Readonly<{ firstName: string; lastName: string; email: string; phone: string }>;
  shipping: Readonly<{
    methodName: string;
    methodType: ShippingMethodType;
    requiresAddress: boolean;
    recipientFirstName: string | null;
    recipientLastName: string | null;
    phone: string | null;
    street: string | null;
    streetNumber: string | null;
    floorApartment: string | null;
    city: string | null;
    province: string | null;
    postalCode: string | null;
    references: string | null;
  }>;
  totals: Readonly<{
    itemsSubtotalInCents: bigint;
    shippingAmountInCents: bigint;
    discountAmountInCents: bigint;
    totalInCents: bigint;
  }>;
  paymentExpiresAt: Date;
  items: ReadonlyArray<Readonly<{
    productId: string;
    productVariantId: string;
    productName: string;
    variantName: string;
    sku: string;
    unitPriceInCents: bigint;
    quantity: number;
    subtotalInCents: bigint;
  }>>;
}>;

export type PendingOrderRecord = Readonly<{
  id: string;
  status: OrderStatusValue;
  paymentExpiresAt: Date;
  reservationReleasedAt: Date | null;
  reservations: ReadonlyArray<Readonly<{
    quantity: number;
    inventory: Readonly<{ id: string; stockOnHand: number; stockReserved: number; version: number }> | null;
  }>>;
}>;

export interface OrderRepository {
  findCheckoutCart(owner: CheckoutOwner, now: Date): Promise<CheckoutCartRecord | null>;
  findCustomer(customerId: string): Promise<CheckoutCustomerRecord | null>;
  listCustomerAddresses(customerId: string): Promise<ReadonlyArray<CheckoutAddressRecord>>;
  findPublicOrder(number: bigint, owner: { customerId: string | null; guestTokenHash: string | null }): Promise<OrderView | null>;
  listAdminOrders(): Promise<ReadonlyArray<AdminOrderRow>>;
  findAdminOrder(id: string): Promise<OrderView | null>;
  listExpiredPendingOrderIds(now: Date, limit: number): Promise<ReadonlyArray<string>>;
  run<T>(work: (transaction: CheckoutTransaction) => Promise<T>): Promise<T>;
}
