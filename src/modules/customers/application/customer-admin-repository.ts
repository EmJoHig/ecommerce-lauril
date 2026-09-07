import type { CustomerAddressRecord, CustomerStatusValue } from "./customer-repository";
import type { OrderStatusValue } from "@/modules/orders/domain/order";
import type { ShippingMethodType } from "@/modules/shipping/domain/shipping";

export const customerAdminSorts = ["newest", "oldest", "name-asc", "name-desc", "updated-desc"] as const;
export type CustomerAdminSort = (typeof customerAdminSorts)[number];
export type CustomerOrderPresence = "with-orders" | "without-orders";

export type AdminCustomerListQuery = Readonly<{
  page: number;
  pageSize: number;
  sort: CustomerAdminSort;
  search?: string;
  status?: CustomerStatusValue;
  orderPresence?: CustomerOrderPresence;
  createdFrom?: Date;
  createdToExclusive?: Date;
}>;

export type AdminCustomerListItem = Readonly<{
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  status: CustomerStatusValue;
  orderCount: number;
  createdAt: Date;
  updatedAt: Date;
}>;

export type AdminCustomerPage = Readonly<{
  items: ReadonlyArray<AdminCustomerListItem>;
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}>;

export type AdminCustomerDetail = Readonly<{
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  document: string | null;
  status: CustomerStatusValue;
  createdAt: Date;
  updatedAt: Date;
  addresses: ReadonlyArray<CustomerAddressRecord>;
  orders: ReadonlyArray<Readonly<{
    id: string;
    number: bigint;
    status: OrderStatusValue;
    totalInCents: bigint;
    shippingMethodName: string;
    shippingMethodType: ShippingMethodType;
    createdAt: Date;
  }>>;
  notes: ReadonlyArray<Readonly<{
    id: string;
    content: string;
    actorName: string;
    actorEmail: string;
    createdAt: Date;
  }>>;
}>;

export interface CustomerAdminRepository {
  list(query: AdminCustomerListQuery): Promise<AdminCustomerPage>;
  find(id: string): Promise<AdminCustomerDetail | null>;
  updateProfile(input: Readonly<{
    customerId: string;
    firstName: string;
    lastName: string;
    phone: string;
    document: string | null;
    actorUserId: string;
    occurredAt: Date;
  }>): Promise<AdminCustomerDetail | null>;
  setStatus(input: Readonly<{
    customerId: string;
    status: CustomerStatusValue;
    actorUserId: string;
    occurredAt: Date;
  }>): Promise<AdminCustomerDetail | null>;
  addNote(input: Readonly<{
    customerId: string;
    actorUserId: string;
    content: string;
    occurredAt: Date;
  }>): Promise<AdminCustomerDetail | null>;
}
