export type CartStatusValue = "ACTIVE" | "CONVERTED" | "ABANDONED";

export type CartIdentity = Readonly<{
  id: string;
  guestTokenHash: string | null;
  customerId: string | null;
  status: CartStatusValue;
  expiresAt: Date;
  version: number;
}>;

export type CartVariantRecord = Readonly<{
  id: string;
  sku: string;
  name: string;
  isActive: boolean;
  priceInCents: bigint;
  promotionalPriceInCents: bigint | null;
  product: Readonly<{
    id: string;
    name: string;
    slug: string;
    status: "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED";
    image: Readonly<{ url: string; altText: string }> | null;
  }>;
  inventory: Readonly<{
    stockOnHand: number;
    stockReserved: number;
  }> | null;
}>;

export type CartItemRecord = Readonly<{
  id: string;
  variantId: string;
  quantity: number;
  unitPriceSnapshotInCents: bigint;
  createdAt: Date;
  variant: CartVariantRecord;
}>;

export type CartRecord = CartIdentity &
  Readonly<{
    items: ReadonlyArray<CartItemRecord>;
  }>;

export interface CartTransaction {
  findCartByTokenHash(tokenHash: string): Promise<CartIdentity | null>;
  findActiveCartByCustomerId(customerId: string): Promise<CartIdentity | null>;
  createCart(input: {
    tokenHash: string | null;
    customerId: string | null;
    expiresAt: Date;
  }): Promise<CartIdentity>;
  resetCart(input: { id: string; expiresAt: Date }): Promise<CartIdentity>;
  findVariant(variantId: string): Promise<CartVariantRecord | null>;
  findItem(cartId: string, variantId: string): Promise<CartItemRecord | null>;
  setItem(input: {
    cartId: string;
    variantId: string;
    quantity: number;
    unitPriceSnapshotInCents: bigint;
  }): Promise<void>;
  removeItem(cartId: string, variantId: string): Promise<boolean>;
  clearItems(cartId: string): Promise<void>;
  assignCartToCustomer(input: { cartId: string; customerId: string; expiresAt: Date }): Promise<CartIdentity>;
  abandonCart(cartId: string, expiresAt: Date): Promise<void>;
  touchCart(cartId: string, expiresAt: Date): Promise<void>;
  readCart(cartId: string): Promise<CartRecord>;
}

export interface CartRepository {
  findActiveByTokenHash(tokenHash: string, now: Date): Promise<CartRecord | null>;
  findActiveByCustomerId(customerId: string, now: Date): Promise<CartRecord | null>;
  run<T>(work: (transaction: CartTransaction) => Promise<T>): Promise<T>;
}
