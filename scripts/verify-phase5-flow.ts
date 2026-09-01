import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { CartService } from "../src/modules/cart/application/cart-service";
import { createGuestCartToken, hashGuestCartToken } from "../src/modules/cart/domain/guest-cart-token";
import { PrismaCartRepository } from "../src/modules/cart/infrastructure/prisma-cart-repository";
import { CheckoutService } from "../src/modules/orders/application/checkout-service";
import { createCheckoutKey } from "../src/modules/orders/domain/checkout-key";
import { PrismaOrderRepository } from "../src/modules/orders/infrastructure/prisma-order-repository";
import { CustomShippingProvider } from "../src/modules/shipping/application/custom-shipping-provider";
import { PrismaShippingRepository } from "../src/modules/shipping/infrastructure/prisma-shipping-repository";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL es obligatoria.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const orderIds: string[] = [];
const cartHashes: string[] = [];

async function main(): Promise<void> {
  const variant = await prisma.productVariant.findFirst({
    where: { isActive: true, product: { status: "ACTIVE" }, inventory: { stockOnHand: { gt: 3 } } },
    include: { inventory: true }, orderBy: { sku: "asc" },
  });
  const pickup = await prisma.shippingMethod.findFirst({ where: { type: "PICKUP", isActive: true } });
  if (!variant?.inventory || !pickup) throw new Error("El seed debe proveer variante con stock y retiro activo.");
  const token = createGuestCartToken();
  const tokenHash = hashGuestCartToken(token);
  cartHashes.push(tokenHash);
  await new CartService(new PrismaCartRepository(prisma), 30).addItem({ tokenHash, variantId: variant.id, quantity: 2 });
  const repository = new PrismaOrderRepository(prisma);
  const checkout = new CheckoutService(repository, new CustomShippingProvider(new PrismaShippingRepository(prisma)), 15);
  const key = createCheckoutKey();
  const before = await prisma.inventory.findUniqueOrThrow({ where: { id: variant.inventory.id } });
  const movementCount = await prisma.inventoryMovement.count();
  const input = {
    owner: { kind: "guest" as const, tokenHash }, checkoutKey: key, shippingMethodId: pickup.id,
    guestBuyer: { firstName: "Verificador", lastName: "Fase Cinco", email: "phase5@test.local", phone: "+54 11 5555-0505" },
  };
  const concurrent = await Promise.all([checkout.confirm(input), checkout.confirm(input)]);
  const order = concurrent[0]!.order;
  orderIds.push(order.id);
  if (concurrent[1]!.order.id !== order.id || (await prisma.order.count({ where: { checkoutKeyHash: { not: "" }, cart: { guestTokenHash: tokenHash } } })) !== 1) {
    throw new Error("La idempotencia concurrente generó pedidos inconsistentes.");
  }
  const afterReserve = await prisma.inventory.findUniqueOrThrow({ where: { id: before.id } });
  if (afterReserve.stockOnHand !== before.stockOnHand || afterReserve.stockReserved !== before.stockReserved + 2) {
    throw new Error("La reserva modificó stock físico o no aumentó stock reservado.");
  }
  if ((await prisma.inventoryMovement.count()) !== movementCount) {
    throw new Error("La reserva creó un movimiento físico.");
  }
  if ((await prisma.cart.findUniqueOrThrow({ where: { id: order.cartId } })).status !== "CONVERTED") {
    throw new Error("El carrito no quedó convertido.");
  }
  if (order.items[0]?.unitPriceInCents !== (variant.promotionalPriceInCents ?? variant.priceInCents)) {
    throw new Error("El snapshot no conservó el precio vigente.");
  }
  if (!(await repository.findPublicOrder(order.number, { customerId: null, guestTokenHash: tokenHash }))) {
    throw new Error("El invitado no pudo acceder con su token.");
  }
  if (await repository.findPublicOrder(order.number, { customerId: null, guestTokenHash: "f".repeat(64) })) {
    throw new Error("Se permitió acceso invitado con token ajeno.");
  }
  const expirationTime = new Date(order.paymentExpiresAt.getTime() + 1);
  if (!(await checkout.expirePendingOrder(order.id, expirationTime))) throw new Error("No se pudo expirar el pedido.");
  if (await checkout.expirePendingOrder(order.id, expirationTime)) throw new Error("La liberación no fue idempotente.");
  const afterRelease = await prisma.inventory.findUniqueOrThrow({ where: { id: before.id } });
  if (afterRelease.stockReserved !== before.stockReserved || afterRelease.stockOnHand !== before.stockOnHand) {
    throw new Error("La expiración no restauró la disponibilidad.");
  }
  const persisted = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true, statusHistory: true } });
  if (persisted.status !== "CANCELLED" || persisted.statusHistory.length !== 2 || persisted.items.length !== 1) {
    throw new Error("Pedido, snapshot o historial incompletos.");
  }
  console.info(JSON.stringify({ status: "ok", guestCheckout: true, serverRevalidation: true, singleOrderOnConcurrentSubmit: true, reservationOnly: true, cartConverted: true, snapshot: true, guestOwnership: true, expirationRelease: true, releaseIdempotent: true }));
}

async function cleanup(): Promise<void> {
  for (const id of orderIds) {
    const row = await prisma.order.findUnique({ where: { id }, select: { status: true, paymentExpiresAt: true } });
    if (row?.status === "PENDING_PAYMENT") {
      const repository = new PrismaOrderRepository(prisma);
      await new CheckoutService(repository, new CustomShippingProvider(new PrismaShippingRepository(prisma))).expirePendingOrder(id, new Date(row.paymentExpiresAt.getTime() + 1));
    }
  }
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.cartItem.deleteMany({ where: { cart: { guestTokenHash: { in: cartHashes } } } });
  await prisma.cart.deleteMany({ where: { guestTokenHash: { in: cartHashes } } });
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; }).finally(async () => { await cleanup(); await prisma.$disconnect(); });
