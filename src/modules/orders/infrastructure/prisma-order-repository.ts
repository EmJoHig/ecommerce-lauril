import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { ConflictError } from "@/shared/domain/errors";
import type {
  AdminOrderRow,
  CheckoutAddressRecord,
  CheckoutCartRecord,
  CheckoutCustomerRecord,
  CheckoutOwner,
  CheckoutTransaction,
  OrderRepository,
  OrderView,
  PendingOrderRecord,
} from "../application/order-repository";
import { mapShippingMethod } from "@/modules/shipping/infrastructure/prisma-shipping-repository";

const checkoutCartInclude = {
  items: {
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    include: { variant: { include: { product: true, inventory: true } } },
  },
} satisfies Prisma.CartInclude;

const orderInclude = {
  items: { orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }] },
  statusHistory: { orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }] },
} satisfies Prisma.OrderInclude;

type CheckoutCartRow = Prisma.CartGetPayload<{ include: typeof checkoutCartInclude }>;
type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
type Transaction = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export class PrismaOrderRepository implements OrderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findCheckoutCart(owner: CheckoutOwner, now: Date): Promise<CheckoutCartRecord | null> {
    const cart = await this.prisma.cart.findFirst({
      where: { ...ownerWhere(owner), status: "ACTIVE", expiresAt: { gt: now } },
      include: checkoutCartInclude,
    });
    return cart ? mapCheckoutCart(cart) : null;
  }

  async findCustomer(customerId: string): Promise<CheckoutCustomerRecord | null> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: { user: true },
    });
    return customer ? mapCustomer(customer) : null;
  }

  async listCustomerAddresses(customerId: string): Promise<ReadonlyArray<CheckoutAddressRecord>> {
    const rows = await this.prisma.customerAddress.findMany({
      where: { customerId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
    return rows.map(mapAddress);
  }

  async findPublicOrder(
    number: bigint,
    owner: { customerId: string | null; guestTokenHash: string | null },
  ): Promise<OrderView | null> {
    const access = owner.customerId
      ? { customerId: owner.customerId }
      : owner.guestTokenHash
        ? { guestAccessTokenHash: owner.guestTokenHash }
        : { id: "00000000-0000-0000-0000-000000000000" };
    const row = await this.prisma.order.findFirst({
      where: { number, ...access },
      include: orderInclude,
    });
    return row ? mapOrder(row) : null;
  }

  async listAdminOrders(): Promise<ReadonlyArray<AdminOrderRow>> {
    const rows = await this.prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        number: true,
        buyerFirstName: true,
        buyerLastName: true,
        buyerEmail: true,
        customerId: true,
        status: true,
        itemsSubtotalInCents: true,
        shippingAmountInCents: true,
        totalInCents: true,
        paymentExpiresAt: true,
        createdAt: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      number: row.number,
      buyerName: `${row.buyerFirstName} ${row.buyerLastName}`,
      buyerEmail: row.buyerEmail,
      customerId: row.customerId,
      status: row.status,
      itemsSubtotalInCents: row.itemsSubtotalInCents,
      shippingAmountInCents: row.shippingAmountInCents,
      totalInCents: row.totalInCents,
      paymentExpiresAt: row.paymentExpiresAt,
      createdAt: row.createdAt,
    }));
  }

  async findAdminOrder(id: string): Promise<OrderView | null> {
    const row = await this.prisma.order.findUnique({ where: { id }, include: orderInclude });
    return row ? mapOrder(row) : null;
  }

  listExpiredPendingOrderIds(now: Date, limit: number): Promise<ReadonlyArray<string>> {
    return this.prisma.order.findMany({
      where: { status: "PENDING_PAYMENT", paymentExpiresAt: { lte: now }, reservationReleasedAt: null },
      orderBy: { paymentExpiresAt: "asc" },
      take: limit,
      select: { id: true },
    }).then((rows) => rows.map(({ id }) => id));
  }

  async run<T>(work: (transaction: CheckoutTransaction) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(
        async (tx) => work(createTransaction(tx)),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }
}

function createTransaction(tx: Transaction): CheckoutTransaction {
  return {
    findOrderByCheckoutKey: async (checkoutKeyHash) => {
      const row = await tx.order.findUnique({ where: { checkoutKeyHash }, include: orderInclude });
      return row ? mapOrder(row) : null;
    },
    findCart: async (owner) => {
      const row = await tx.cart.findFirst({ where: ownerWhere(owner), include: checkoutCartInclude });
      return row ? mapCheckoutCart(row) : null;
    },
    findCustomer: async (customerId) => {
      const row = await tx.customer.findUnique({ where: { id: customerId }, include: { user: true } });
      return row ? mapCustomer(row) : null;
    },
    findAddress: async (customerId, addressId) => {
      const row = await tx.customerAddress.findFirst({ where: { id: addressId, customerId } });
      return row ? mapAddress(row) : null;
    },
    findShippingMethod: async (methodId) => {
      const row = await tx.shippingMethod.findUnique({ where: { id: methodId } });
      return row ? mapShippingMethod(row) : null;
    },
    reserveInventory: async (input) => {
      const updated = await tx.inventory.updateMany({
        where: { id: input.id, version: input.expectedVersion },
        data: { stockReserved: input.stockReserved, version: { increment: 1 } },
      });
      return updated.count === 1;
    },
    createOrder: async (input) => {
      const row = await tx.order.create({
        data: {
          cartId: input.cartId,
          customerId: input.customerId,
          shippingMethodId: input.shippingMethodId,
          checkoutKeyHash: input.checkoutKeyHash,
          guestAccessTokenHash: input.guestAccessTokenHash,
          status: "PENDING_PAYMENT",
          buyerFirstName: input.buyer.firstName,
          buyerLastName: input.buyer.lastName,
          buyerEmail: input.buyer.email,
          buyerPhone: input.buyer.phone,
          shippingMethodName: input.shipping.methodName,
          shippingMethodType: input.shipping.methodType,
          shippingRequiresAddress: input.shipping.requiresAddress,
          shippingRecipientFirstName: input.shipping.recipientFirstName,
          shippingRecipientLastName: input.shipping.recipientLastName,
          shippingPhone: input.shipping.phone,
          shippingStreet: input.shipping.street,
          shippingStreetNumber: input.shipping.streetNumber,
          shippingFloorApartment: input.shipping.floorApartment,
          shippingCity: input.shipping.city,
          shippingProvince: input.shipping.province,
          shippingPostalCode: input.shipping.postalCode,
          shippingReferences: input.shipping.references,
          itemsSubtotalInCents: input.totals.itemsSubtotalInCents,
          shippingAmountInCents: input.totals.shippingAmountInCents,
          discountAmountInCents: input.totals.discountAmountInCents,
          totalInCents: input.totals.totalInCents,
          paymentExpiresAt: input.paymentExpiresAt,
          items: { create: [...input.items] },
          statusHistory: {
            create: {
              fromStatus: null,
              toStatus: "PENDING_PAYMENT",
              reason: "Pedido creado; reserva temporal pendiente de pago.",
            },
          },
        },
        include: orderInclude,
      });
      return mapOrder(row);
    },
    convertCart: async (cartId, convertedAt) => {
      const result = await tx.cart.updateMany({
        where: { id: cartId, status: "ACTIVE" },
        data: { status: "CONVERTED", expiresAt: convertedAt, version: { increment: 1 } },
      });
      return result.count === 1;
    },
    findPendingOrder: async (orderId): Promise<PendingOrderRecord | null> => {
      const row = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: { include: { productVariant: { include: { inventory: true } } } } },
      });
      if (!row) return null;
      return {
        id: row.id,
        status: row.status,
        paymentExpiresAt: row.paymentExpiresAt,
        reservationReleasedAt: row.reservationReleasedAt,
        reservations: row.items.map((item) => ({
          quantity: item.quantity,
          inventory: item.productVariant?.inventory
            ? {
                id: item.productVariant.inventory.id,
                stockOnHand: item.productVariant.inventory.stockOnHand,
                stockReserved: item.productVariant.inventory.stockReserved,
                version: item.productVariant.inventory.version,
              }
            : null,
        })),
      };
    },
    releaseInventory: async (input) => {
      const result = await tx.inventory.updateMany({
        where: { id: input.id, version: input.expectedVersion },
        data: { stockReserved: input.stockReserved, version: { increment: 1 } },
      });
      return result.count === 1;
    },
    cancelExpiredOrder: async (orderId, expiredAt) => {
      const updated = await tx.order.updateMany({
        where: {
          id: orderId,
          status: "PENDING_PAYMENT",
          paymentExpiresAt: { lte: expiredAt },
          reservationReleasedAt: null,
        },
        data: { status: "CANCELLED", reservationReleasedAt: expiredAt },
      });
      if (updated.count !== 1) return false;
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: "PENDING_PAYMENT",
          toStatus: "CANCELLED",
          reason: "La reserva venció sin confirmación de pago.",
        },
      });
      return true;
    },
  };
}

function ownerWhere(owner: CheckoutOwner) {
  return owner.kind === "customer"
    ? { customerId: owner.customerId }
    : { guestTokenHash: owner.tokenHash };
}

function mapCheckoutCart(row: CheckoutCartRow): CheckoutCartRecord {
  return {
    id: row.id,
    status: row.status,
    expiresAt: row.expiresAt,
    guestTokenHash: row.guestTokenHash,
    customerId: row.customerId,
    items: row.items.map((item) => ({
      quantity: item.quantity,
      variant: {
        id: item.variant.id,
        sku: item.variant.sku,
        name: item.variant.name,
        isActive: item.variant.isActive,
        priceInCents: item.variant.priceInCents,
        promotionalPriceInCents: item.variant.promotionalPriceInCents,
        product: {
          id: item.variant.product.id,
          name: item.variant.product.name,
          status: item.variant.product.status,
        },
        inventory: item.variant.inventory
          ? {
              id: item.variant.inventory.id,
              stockOnHand: item.variant.inventory.stockOnHand,
              stockReserved: item.variant.inventory.stockReserved,
              version: item.variant.inventory.version,
            }
          : null,
      },
    })),
  };
}

function mapCustomer(row: Prisma.CustomerGetPayload<{ include: { user: true } }>): CheckoutCustomerRecord {
  return {
    id: row.id,
    userId: row.userId,
    firstName: row.user.firstName,
    lastName: row.user.lastName,
    email: row.user.email,
    phone: row.phone,
    status: row.status,
    userStatus: row.user.status,
  };
}

function mapAddress(row: Prisma.CustomerAddressGetPayload<object>): CheckoutAddressRecord {
  return {
    id: row.id,
    customerId: row.customerId,
    label: row.label,
    recipientFirstName: row.recipientFirstName,
    recipientLastName: row.recipientLastName,
    phone: row.phone,
    street: row.street,
    streetNumber: row.streetNumber,
    floorApartment: row.floorApartment,
    city: row.city,
    province: row.province,
    postalCode: row.postalCode,
    references: row.references,
    isDefault: row.isDefault,
  };
}

function mapOrder(row: OrderRow): OrderView {
  return {
    id: row.id,
    number: row.number,
    cartId: row.cartId,
    customerId: row.customerId,
    guestAccessTokenHash: row.guestAccessTokenHash,
    status: row.status,
    buyerFirstName: row.buyerFirstName,
    buyerLastName: row.buyerLastName,
    buyerEmail: row.buyerEmail,
    buyerPhone: row.buyerPhone,
    shippingMethodName: row.shippingMethodName,
    shippingMethodType: row.shippingMethodType,
    shippingRequiresAddress: row.shippingRequiresAddress,
    shippingRecipientFirstName: row.shippingRecipientFirstName,
    shippingRecipientLastName: row.shippingRecipientLastName,
    shippingPhone: row.shippingPhone,
    shippingStreet: row.shippingStreet,
    shippingStreetNumber: row.shippingStreetNumber,
    shippingFloorApartment: row.shippingFloorApartment,
    shippingCity: row.shippingCity,
    shippingProvince: row.shippingProvince,
    shippingPostalCode: row.shippingPostalCode,
    shippingReferences: row.shippingReferences,
    itemsSubtotalInCents: row.itemsSubtotalInCents,
    shippingAmountInCents: row.shippingAmountInCents,
    discountAmountInCents: row.discountAmountInCents,
    totalInCents: row.totalInCents,
    paymentExpiresAt: row.paymentExpiresAt,
    reservationReleasedAt: row.reservationReleasedAt,
    createdAt: row.createdAt,
    items: row.items.map((item) => ({
      productName: item.productName,
      variantName: item.variantName,
      sku: item.sku,
      unitPriceInCents: item.unitPriceInCents,
      quantity: item.quantity,
      subtotalInCents: item.subtotalInCents,
    })),
    history: row.statusHistory.map((entry) => ({
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      reason: entry.reason,
      createdAt: entry.createdAt,
    })),
  };
}

function mapPersistenceError(error: unknown): Error {
  if (error instanceof Error && "code" in error && ["P2002", "P2034"].includes(String(error.code))) {
    return new ConflictError("El checkout cambió en simultáneo; se volverá a comprobar.");
  }
  return error instanceof Error ? error : new Error("Error de persistencia del pedido.");
}
