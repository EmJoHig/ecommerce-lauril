import "dotenv/config";

import { createHash, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { CartService } from "../src/modules/cart/application/cart-service";
import { createGuestCartToken, hashGuestCartToken } from "../src/modules/cart/domain/guest-cart-token";
import { PrismaCartRepository } from "../src/modules/cart/infrastructure/prisma-cart-repository";
import { OrderAdminService } from "../src/modules/orders/application/order-admin-service";
import { CheckoutService } from "../src/modules/orders/application/checkout-service";
import { createCheckoutKey } from "../src/modules/orders/domain/checkout-key";
import { PrismaOrderAdminRepository } from "../src/modules/orders/infrastructure/prisma-order-admin-repository";
import { PrismaOrderRepository } from "../src/modules/orders/infrastructure/prisma-order-repository";
import { CustomShippingProvider } from "../src/modules/shipping/application/custom-shipping-provider";
import { PrismaShippingRepository } from "../src/modules/shipping/infrastructure/prisma-shipping-repository";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL es obligatoria.");
assertLocalDevelopmentDatabase(databaseUrl);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const command = process.argv[2];

async function main(): Promise<void> {
  if (command === "cleanup") return cleanup();
  if (command !== "create") throw new Error("Usá create o cleanup.");
  await cleanup();
  const admin = await prisma.user.findFirst({ where: { status: "ACTIVE", roles: { some: { role: { permissions: { some: { permission: { code: "orders.write" } } } } } } } });
  const variant = await prisma.productVariant.findFirst({ where: { isActive: true, product: { status: "ACTIVE" }, inventory: { stockOnHand: { gt: 4 } } }, include: { product: true, inventory: true }, orderBy: { sku: "asc" } });
  const pickup = await prisma.shippingMethod.findFirst({ where: { type: "PICKUP", isActive: true } });
  const shipping = await prisma.shippingMethod.findFirst({ where: { type: { in: ["FLAT_RATE", "LOCAL_DELIVERY"] }, isActive: true, requiresAddress: true } });
  if (!admin || !variant?.inventory || !pickup || !shipping) throw new Error("Ejecutá el seed antes de crear los fixtures.");

  const guestTokenHash = hashGuestCartToken(createGuestCartToken());
  await new CartService(new PrismaCartRepository(prisma), 30).addItem({ tokenHash: guestTokenHash, variantId: variant.id, quantity: 1 });
  const pending = (await new CheckoutService(new PrismaOrderRepository(prisma), new CustomShippingProvider(new PrismaShippingRepository(prisma)), 15).confirm({
    owner: { kind: "guest", tokenHash: guestTokenHash }, checkoutKey: createCheckoutKey(), shippingMethodId: pickup.id,
    guestBuyer: { firstName: "Manual", lastName: "Pendiente", email: "phase6-manual-pending@test.local", phone: "+54 11 5555-0610" },
  })).order;
  const paidShipping = await createPaidFixture("shipping", shipping, variant);
  const paidPickup = await createPaidFixture("pickup", pickup, variant);
  console.info(JSON.stringify({ status: "created", pending: { id: pending.id, number: pending.number.toString() }, shippingPaid: paidShipping, pickupPaid: paidPickup }));
}

async function createPaidFixture(
  label: string,
  method: { id: string; name: string; type: "PICKUP" | "FLAT_RATE" | "LOCAL_DELIVERY" | "TO_COORDINATE"; requiresAddress: boolean },
  variant: { id: string; sku: string; name: string; priceInCents: bigint; promotionalPriceInCents: bigint | null; product: { id: string; name: string } },
) {
  const marker = randomUUID();
  const createdAt = new Date();
  const guestTokenHash = sha256(`phase6-manual-${label}-${marker}`);
  const unitPrice = variant.promotionalPriceInCents ?? variant.priceInCents;
  const cart = await prisma.cart.create({ data: { guestTokenHash, status: "CONVERTED", expiresAt: new Date(createdAt.getTime() + 86_400_000) } });
  const order = await prisma.order.create({ data: {
    cartId: cart.id, shippingMethodId: method.id, checkoutKeyHash: sha256(`checkout-${marker}`), guestAccessTokenHash: guestTokenHash,
    status: "PAID", buyerFirstName: "Manual", buyerLastName: label === "pickup" ? "Retiro" : "Envío", buyerEmail: `phase6-manual-${label}@test.local`, buyerPhone: "+54 11 5555-0611",
    shippingMethodName: method.name, shippingMethodType: method.type, shippingRequiresAddress: method.requiresAddress,
    shippingRecipientFirstName: method.requiresAddress ? "Manual" : null, shippingRecipientLastName: method.requiresAddress ? "Envío" : null,
    shippingPhone: method.requiresAddress ? "+54 11 5555-0611" : null, shippingStreet: method.requiresAddress ? "Calle Manual" : null,
    shippingStreetNumber: method.requiresAddress ? "600" : null, shippingCity: method.requiresAddress ? "CABA" : null,
    shippingProvince: method.requiresAddress ? "Buenos Aires" : null, shippingPostalCode: method.requiresAddress ? "1000" : null,
    itemsSubtotalInCents: unitPrice, shippingAmountInCents: 0n, totalInCents: unitPrice,
    paymentExpiresAt: new Date(createdAt.getTime() + 900_000), reservationReleasedAt: createdAt, createdAt, updatedAt: createdAt,
    items: { create: { productId: variant.product.id, productVariantId: variant.id, productName: variant.product.name, variantName: variant.name, sku: variant.sku, unitPriceInCents: unitPrice, quantity: 1, subtotalInCents: unitPrice } },
  } });
  await prisma.orderStatusHistory.createMany({ data: [
    { orderId: order.id, fromStatus: null, toStatus: "PENDING_PAYMENT", reason: "Fixture manual local de FASE 6.", createdAt },
    { orderId: order.id, fromStatus: "PENDING_PAYMENT", toStatus: "PAID", reason: "Estado sintético exclusivo de desarrollo local.", createdAt: new Date(createdAt.getTime() + 1) },
  ] });
  return { id: order.id, number: order.number.toString() };
}

async function cleanup(): Promise<void> {
  const orders = await prisma.order.findMany({ where: { buyerEmail: { startsWith: "phase6-manual-" } }, select: { id: true, cartId: true, status: true, reservationReleasedAt: true } });
  const admin = await prisma.user.findFirst({ where: { roles: { some: { role: { permissions: { some: { permission: { code: "orders.write" } } } } } } } });
  if (admin) {
    const service = new OrderAdminService(new PrismaOrderAdminRepository(prisma));
    for (const order of orders) if (order.status === "PENDING_PAYMENT" && !order.reservationReleasedAt) {
      await service.transition({ orderId: order.id, toStatus: "CANCELLED", actorUserId: admin.id, reason: "Limpieza de fixture manual FASE 6" });
    }
  }
  const ids = orders.map(({ id }) => id);
  await prisma.auditLog.deleteMany({ where: { entityType: "Order", entityId: { in: ids } } });
  await prisma.order.deleteMany({ where: { id: { in: ids } } });
  await prisma.cart.deleteMany({ where: { id: { in: orders.map(({ cartId }) => cartId) } } });
  if (command === "cleanup") console.info(JSON.stringify({ status: "clean", orders: orders.length }));
}

function assertLocalDevelopmentDatabase(value: string): void {
  if (process.env.NODE_ENV === "production") throw new Error("Los fixtures FASE 6 están deshabilitados en producción.");
  const hostname = new URL(value).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) throw new Error("Los fixtures FASE 6 solo pueden ejecutarse contra PostgreSQL local.");
}

function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
