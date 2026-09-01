import type { ShippingMethodType } from "@/modules/shipping/domain/shipping";
import type { OrderStatusValue } from "../domain/order";

export const adminOrderSorts = ["newest", "oldest", "number-desc", "number-asc", "total-desc", "total-asc"] as const;
export type AdminOrderSort = (typeof adminOrderSorts)[number];
export type AdminOrderOwnerType = "customer" | "guest";

export type AdminOrderListQuery = Readonly<{
  page: number;
  pageSize: number;
  sort: AdminOrderSort;
  search?: string;
  status?: OrderStatusValue;
  ownerType?: AdminOrderOwnerType;
  shippingMethodId?: string;
  createdFrom?: Date;
  createdToExclusive?: Date;
}>;

export type AdminOrderListItem = Readonly<{
  id: string;
  number: bigint;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  customerId: string | null;
  itemCount: number;
  status: OrderStatusValue;
  shippingMethodName: string;
  shippingMethodType: ShippingMethodType;
  itemsSubtotalInCents: bigint;
  shippingAmountInCents: bigint;
  totalInCents: bigint;
  paymentExpiresAt: Date;
  createdAt: Date;
}>;

export type AdminOrderPage = Readonly<{
  items: ReadonlyArray<AdminOrderListItem>;
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}>;

export type AdminOrderDetail = Readonly<{
  id: string;
  number: bigint;
  customerId: string | null;
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
  updatedAt: Date;
  items: ReadonlyArray<Readonly<{
    id: string;
    productId: string | null;
    productVariantId: string | null;
    productName: string;
    variantName: string;
    sku: string;
    unitPriceInCents: bigint;
    quantity: number;
    subtotalInCents: bigint;
  }>>;
  history: ReadonlyArray<Readonly<{
    id: string;
    fromStatus: OrderStatusValue | null;
    toStatus: OrderStatusValue;
    reason: string;
    actorUserId: string | null;
    actorName: string | null;
    actorEmail: string | null;
    createdAt: Date;
  }>>;
  notes: ReadonlyArray<Readonly<{
    id: string;
    content: string;
    actorUserId: string;
    actorName: string;
    actorEmail: string;
    createdAt: Date;
  }>>;
}>;

export type AdminOrderTransitionCommand = Readonly<{
  orderId: string;
  fromStatus: OrderStatusValue;
  toStatus: OrderStatusValue;
  actorUserId: string;
  reason: string;
  changedAt: Date;
}>;

export type AdminOrderCancellationCommand = Readonly<{
  orderId: string;
  actorUserId: string;
  reason: string;
  changedAt: Date;
}>;

export type AdminOrderMutationResult = Readonly<{
  changed: boolean;
  order: AdminOrderDetail | null;
}>;

export interface OrderAdminRepository {
  list(query: AdminOrderListQuery): Promise<AdminOrderPage>;
  find(id: string): Promise<AdminOrderDetail | null>;
  transition(command: AdminOrderTransitionCommand): Promise<AdminOrderMutationResult>;
  cancelPending(command: AdminOrderCancellationCommand): Promise<AdminOrderMutationResult>;
  addNote(input: Readonly<{ orderId: string; actorUserId: string; content: string; createdAt: Date }>): Promise<AdminOrderDetail | null>;
}
