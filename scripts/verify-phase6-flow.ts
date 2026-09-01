import "dotenv/config";

import { createHash } from "node:crypto";
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
import { ValidationError, NotFoundError } from "../src/shared/domain/errors";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL es obligatoria.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const orderIds: string[] = [];
const cartIds: string[] = [];

async function main(): Promise<void> {
  const admin = await prisma.user.findFirst({
    where: { status: "ACTIVE", roles: { some: { role: { permissions: { some: { permission: { code: "orders.write" } } } } } } },
  });
  const variant = await prisma.productVariant.findFirst({
    where: { isActive: true, product: { status: "ACTIVE" }, inventory: { stockOnHand: { gt: 3 } } },
    include: { inventory: true, product: true }, orderBy: { sku: "asc" },
  });
  const pickup = await prisma.shippingMethod.findFirst({ where: { type: "PICKUP", isActive: true } });
  const shipping = await prisma.shippingMethod.findFirst({ where: { type: { in: ["FLAT_RATE", "LOCAL_DELIVERY"] }, isActive: true, requiresAddress: true } });
  if (!admin || !variant?.inventory || !pickup || !shipping) throw new Error("El seed debe proveer administrador, catálogo y métodos de entrega.");

  const token = createGuestCartToken();
  const tokenHash = hashGuestCartToken(token);
  await new CartService(new PrismaCartRepository(prisma), 30).addItem({ tokenHash, variantId: variant.id, quantity: 2 });
  const checkout = new CheckoutService(
    new PrismaOrderRepository(prisma),
    new CustomShippingProvider(new PrismaShippingRepository(prisma)),
    15,
  );
  const pending = (await checkout.confirm({
    owner: { kind: "guest", tokenHash }, checkoutKey: createCheckoutKey(), shippingMethodId: pickup.id,
    guestBuyer: { firstName: "Pendiente", lastName: "Fase Seis", email: "phase6-pending@test.local", phone: "+54 11 5555-0601" },
  })).order;
  orderIds.push(pending.id); cartIds.push(pending.cartId);
  const inventoryBeforeCancel = await prisma.inventory.findUniqueOrThrow({ where: { id: variant.inventory.id } });
  const movementCount = await prisma.inventoryMovement.count();
  const service = new OrderAdminService(new PrismaOrderAdminRepository(prisma));
  const cancellations = await Promise.all([
    service.transition({ orderId: pending.id, toStatus: "CANCELLED", actorUserId: admin.id, reason: "Cancelación de verificación" }),
    service.transition({ orderId: pending.id, toStatus: "CANCELLED", actorUserId: admin.id, reason: "Cancelación concurrente repetida" }),
  ]);
  if (cancellations.filter(({ changed }) => changed).length !== 1) throw new Error("La cancelación concurrente no fue idempotente.");
  const inventoryAfterCancel = await prisma.inventory.findUniqueOrThrow({ where: { id: variant.inventory.id } });
  if (inventoryAfterCancel.stockOnHand !== inventoryBeforeCancel.stockOnHand || inventoryAfterCancel.stockReserved !== inventoryBeforeCancel.stockReserved - 2) {
    throw new Error("La cancelación no liberó exactamente la reserva.");
  }
  if ((await prisma.inventoryMovement.count()) !== movementCount) throw new Error("La liberación creó un movimiento físico.");
  if ((await service.transition({ orderId: pending.id, toStatus: "CANCELLED", actorUserId: admin.id })).changed) {
    throw new Error("La cancelación repetida no fue idempotente.");
  }

  const shippingOrder = await createSyntheticPaidOrder({ adminId: admin.id, methodId: shipping.id, methodName: shipping.name, methodType: shipping.type, requiresAddress: true, variant });
  const pickupOrder = await createSyntheticPaidOrder({ adminId: admin.id, methodId: pickup.id, methodName: pickup.name, methodType: pickup.type, requiresAddress: false, variant });
  for (const order of [shippingOrder, pickupOrder]) { orderIds.push(order.id); cartIds.push(order.cartId); }

  for (const toStatus of ["PREPARING", "READY_TO_SHIP", "SHIPPED", "DELIVERED"] as const) {
    await service.transition({ orderId: shippingOrder.id, toStatus, actorUserId: admin.id });
  }
  for (const toStatus of ["PREPARING", "READY_TO_SHIP", "DELIVERED"] as const) {
    await service.transition({ orderId: pickupOrder.id, toStatus, actorUserId: admin.id });
  }
  await service.addNote({ orderId: shippingOrder.id, actorUserId: admin.id, content: "Nota interna del verificador FASE 6" });
  const detail = await service.find(shippingOrder.id);
  if (detail.status !== "DELIVERED" || detail.history.length !== 6 || detail.notes.length !== 1) {
    throw new Error("El flujo, historial o nota interna quedaron incompletos.");
  }
  if (!detail.history.slice(2).every((entry) => entry.actorUserId === admin.id)) throw new Error("El historial perdió el actor administrativo.");
  try {
    await service.transition({ orderId: shippingOrder.id, toStatus: "SHIPPED", actorUserId: admin.id });
    throw new Error("Se aceptó una transición inválida.");
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
  }
  const byNumber = await service.list({ search: shippingOrder.number.toString() });
  const byBuyer = await service.list({ search: "phase6-synthetic", status: "DELIVERED", ownerType: "guest", shippingMethodId: shipping.id });
  if (byNumber.total !== 1 || byBuyer.total !== 1) throw new Error("La búsqueda o los filtros administrativos fallaron.");
  if ((await prisma.auditLog.count({ where: { entityType: "Order", entityId: { in: orderIds } } })) < 9) throw new Error("Faltan eventos de auditoría.");
  const publicOrder = await new PrismaOrderRepository(prisma).findPublicOrder(shippingOrder.number, { customerId: null, guestTokenHash: shippingOrder.guestTokenHash });
  if (!publicOrder || "notes" in publicOrder) throw new Error("Una nota interna se expuso en la consulta pública.");
  await expectNotFound(service);
  console.info(JSON.stringify({ status: "ok", pendingCancellation: true, reservationReleasedOnce: true, noPhysicalMovement: true, shippingFlow: true, pickupFlow: true, invalidTransitionRejected: true, statusHistoryWithActor: true, internalNotesPrivate: true, filtersAndSearch: true, auditLog: true }));
}

async function createSyntheticPaidOrder(input: {
  adminId: string;
  methodId: string;
  methodName: string;
  methodType: "PICKUP" | "FLAT_RATE" | "LOCAL_DELIVERY" | "TO_COORDINATE";
  requiresAddress: boolean;
  variant: { id: string; sku: string; name: string; priceInCents: bigint; promotionalPriceInCents: bigint | null; product: { id: string; name: string } };
}) {
  const marker = `${input.methodType.toLowerCase()}-${cryptoMarker()}`;
  const guestTokenHash = sha256(`guest-${marker}`);
  const createdAt = new Date();
  const unitPrice = input.variant.promotionalPriceInCents ?? input.variant.priceInCents;
  const cart = await prisma.cart.create({ data: { guestTokenHash, status: "CONVERTED", expiresAt: new Date(createdAt.getTime() + 86_400_000) } });
  const order = await prisma.order.create({ data: {
    cartId: cart.id, customerId: null, shippingMethodId: input.methodId, checkoutKeyHash: sha256(`checkout-${marker}`), guestAccessTokenHash: guestTokenHash,
    status: "PAID", buyerFirstName: "Synthetic", buyerLastName: "Fase Seis", buyerEmail: `phase6-synthetic-${marker}@test.local`, buyerPhone: "+54 11 5555-0602",
    shippingMethodName: input.methodName, shippingMethodType: input.methodType, shippingRequiresAddress: input.requiresAddress,
    shippingRecipientFirstName: input.requiresAddress ? "Synthetic" : null, shippingRecipientLastName: input.requiresAddress ? "Fase Seis" : null,
    shippingPhone: input.requiresAddress ? "+54 11 5555-0602" : null, shippingStreet: input.requiresAddress ? "Calle Test" : null,
    shippingStreetNumber: input.requiresAddress ? "600" : null, shippingCity: input.requiresAddress ? "CABA" : null,
    shippingProvince: input.requiresAddress ? "Buenos Aires" : null, shippingPostalCode: input.requiresAddress ? "1000" : null,
    itemsSubtotalInCents: unitPrice, shippingAmountInCents: 0n, discountAmountInCents: 0n, totalInCents: unitPrice,
    paymentExpiresAt: new Date(createdAt.getTime() + 900_000), reservationReleasedAt: createdAt, createdAt, updatedAt: createdAt,
    items: { create: { productId: input.variant.product.id, productVariantId: input.variant.id, productName: input.variant.product.name, variantName: input.variant.name, sku: input.variant.sku, unitPriceInCents: unitPrice, quantity: 1, subtotalInCents: unitPrice } },
  } });
  await prisma.orderStatusHistory.createMany({ data: [
    { orderId: order.id, fromStatus: null, toStatus: "PENDING_PAYMENT", reason: "Fixture sintético de desarrollo/test.", createdAt },
    { orderId: order.id, fromStatus: "PENDING_PAYMENT", toStatus: "PAID", reason: "Estado sintético exclusivo de desarrollo/test.", createdAt: new Date(createdAt.getTime() + 1) },
  ] });
  return { id: order.id, number: order.number, cartId: cart.id, guestTokenHash };
}

async function expectNotFound(service: OrderAdminService): Promise<void> {
  try { await service.find("00000000-0000-4000-8000-000000000099"); throw new Error("Se encontró un pedido inexistente."); }
  catch (error) { if (!(error instanceof NotFoundError)) throw error; }
}

function cryptoMarker(): string { return Math.random().toString(36).slice(2, 12); }
function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }

async function cleanup(): Promise<void> {
  await prisma.auditLog.deleteMany({ where: { entityType: "Order", entityId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.cart.deleteMany({ where: { id: { in: cartIds } } });
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; }).finally(async () => { await cleanup(); await prisma.$disconnect(); });
