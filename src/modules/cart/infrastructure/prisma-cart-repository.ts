import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { ConflictError } from "@/shared/domain/errors";
import type {
  CartIdentity,
  CartItemRecord,
  CartRecord,
  CartRepository,
  CartTransaction,
  CartVariantRecord,
} from "../application/cart-repository";

const variantInclude = {
  product: {
    include: {
      images: {
        orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
        take: 1,
      },
    },
  },
  inventory: true,
} satisfies Prisma.ProductVariantInclude;

const cartInclude = {
  items: {
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    include: { variant: { include: variantInclude } },
  },
} satisfies Prisma.CartInclude;

type VariantRow = Prisma.ProductVariantGetPayload<{ include: typeof variantInclude }>;
type CartRow = Prisma.CartGetPayload<{ include: typeof cartInclude }>;
type Transaction = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export class PrismaCartRepository implements CartRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findActiveByTokenHash(tokenHash: string, now: Date): Promise<CartRecord | null> {
    const cart = await this.prisma.cart.findFirst({
      where: { guestTokenHash: tokenHash, status: "ACTIVE", expiresAt: { gt: now } },
      include: cartInclude,
    });
    return cart ? mapCart(cart) : null;
  }

  async run<T>(work: (transaction: CartTransaction) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(
        async (prismaTransaction) => work(createTransaction(prismaTransaction)),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      throw mapCartPersistenceError(error);
    }
  }
}

function createTransaction(transaction: Transaction): CartTransaction {
  return {
    findCartByTokenHash: async (tokenHash) => {
      const cart = await transaction.cart.findUnique({
        where: { guestTokenHash: tokenHash },
        select: { id: true, status: true, expiresAt: true, version: true },
      });
      return cart ? mapIdentity(cart) : null;
    },
    createCart: async (input) =>
      mapIdentity(
        await transaction.cart.create({
          data: { guestTokenHash: input.tokenHash, expiresAt: input.expiresAt },
          select: { id: true, status: true, expiresAt: true, version: true },
        }),
      ),
    resetCart: async (input) => {
      await transaction.cartItem.deleteMany({ where: { cartId: input.id } });
      return mapIdentity(
        await transaction.cart.update({
          where: { id: input.id },
          data: {
            status: "ACTIVE",
            expiresAt: input.expiresAt,
            version: { increment: 1 },
          },
          select: { id: true, status: true, expiresAt: true, version: true },
        }),
      );
    },
    findVariant: async (variantId) => {
      const variant = await transaction.productVariant.findUnique({
        where: { id: variantId },
        include: variantInclude,
      });
      return variant ? mapVariant(variant) : null;
    },
    findItem: async (cartId, variantId) => {
      const item = await transaction.cartItem.findUnique({
        where: { cartId_variantId: { cartId, variantId } },
        include: { variant: { include: variantInclude } },
      });
      return item ? mapItem(item) : null;
    },
    setItem: async (input) => {
      await transaction.cartItem.upsert({
        where: {
          cartId_variantId: {
            cartId: input.cartId,
            variantId: input.variantId,
          },
        },
        update: {
          quantity: input.quantity,
          unitPriceSnapshotInCents: input.unitPriceSnapshotInCents,
        },
        create: input,
      });
    },
    removeItem: async (cartId, variantId) => {
      const result = await transaction.cartItem.deleteMany({
        where: { cartId, variantId },
      });
      return result.count === 1;
    },
    clearItems: async (cartId) => {
      await transaction.cartItem.deleteMany({ where: { cartId } });
    },
    touchCart: async (cartId, expiresAt) => {
      await transaction.cart.update({
        where: { id: cartId },
        data: { expiresAt, version: { increment: 1 } },
      });
    },
    readCart: async (cartId) =>
      mapCart(
        await transaction.cart.findUniqueOrThrow({
          where: { id: cartId },
          include: cartInclude,
        }),
      ),
  };
}

function mapIdentity(row: {
  id: string;
  status: "ACTIVE" | "CONVERTED" | "ABANDONED";
  expiresAt: Date;
  version: number;
}): CartIdentity {
  return row;
}

function mapVariant(row: VariantRow): CartVariantRecord {
  const image = row.product.images[0];
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    isActive: row.isActive,
    priceInCents: row.priceInCents,
    promotionalPriceInCents: row.promotionalPriceInCents,
    product: {
      id: row.product.id,
      name: row.product.name,
      slug: row.product.slug,
      status: row.product.status,
      image: image ? { url: image.url, altText: image.altText } : null,
    },
    inventory: row.inventory
      ? {
          stockOnHand: row.inventory.stockOnHand,
          stockReserved: row.inventory.stockReserved,
        }
      : null,
  };
}

function mapItem(row: CartRow["items"][number]): CartItemRecord {
  return {
    id: row.id,
    variantId: row.variantId,
    quantity: row.quantity,
    unitPriceSnapshotInCents: row.unitPriceSnapshotInCents,
    createdAt: row.createdAt,
    variant: mapVariant(row.variant),
  };
}

function mapCart(row: CartRow): CartRecord {
  return {
    ...mapIdentity(row),
    items: row.items.map(mapItem),
  };
}

function mapCartPersistenceError(error: unknown): Error {
  if (error instanceof Error && "code" in error && error.code === "P2034") {
    return new ConflictError(
      "El carrito cambió en otra pestaña; volvé a intentar la operación.",
    );
  }
  if (error instanceof Error && "code" in error && error.code === "P2002") {
    return new ConflictError(
      "El carrito se actualizó al mismo tiempo; volvé a intentar la operación.",
    );
  }
  return error instanceof Error ? error : new Error("Error de persistencia del carrito.");
}
