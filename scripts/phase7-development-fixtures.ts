import "dotenv/config";

import { createHash, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/modules/auth/domain/password";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL es obligatoria.");
assertLocalDatabase(databaseUrl);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const command = process.argv[2];
const fixtureEmails = ["phase7-admin@test.local", "phase7-limited@test.local", "phase7-customer@test.local"] as const;

async function main(): Promise<void> {
  if (command === "cleanup") return cleanup();
  if (command !== "create") throw new Error("Usá create o cleanup.");
  const password = process.env.PHASE7_FIXTURE_PASSWORD;
  if (!password) throw new Error("PHASE7_FIXTURE_PASSWORD es obligatoria para crear fixtures.");
  await cleanup();
  const [adminRole, adminAccess, pickup, variant] = await Promise.all([
    prisma.role.findUnique({ where: { code: "ADMIN" } }),
    prisma.permission.findUnique({ where: { code: "admin.access" } }),
    prisma.shippingMethod.findFirst({ where: { type: "PICKUP", isActive: true } }),
    prisma.productVariant.findFirst({ where: { isActive: true, product: { status: "ACTIVE" } }, include: { product: true }, orderBy: { sku: "asc" } }),
  ]);
  if (!adminRole || !adminAccess || !pickup || !variant) throw new Error("Ejecutá el seed antes de crear fixtures FASE 7.");
  const passwordHash = await hashPassword(password, 10);
  const fullAdmin = await prisma.user.create({ data: { email: fixtureEmails[0], passwordHash, firstName: "Admin", lastName: "Fase 7", roles: { create: { roleId: adminRole.id } } } });
  const limitedRole = await prisma.role.create({ data: { code: "PHASE7_LIMITED", name: "Acceso limitado Fase 7", description: "Fixture local temporal.", permissions: { create: { permissionId: adminAccess.id } } } });
  await prisma.user.create({ data: { email: fixtureEmails[1], passwordHash, firstName: "Operador", lastName: "Limitado", roles: { create: { roleId: limitedRole.id } } } });
  const customerUser = await prisma.user.create({ data: {
    email: fixtureEmails[2], passwordHash, firstName: "Cliente", lastName: "Manual",
    customer: { create: { phone: "+54 11 5555-0707", document: "30707070", addresses: { create: { label: "Casa", recipientFirstName: "Cliente", recipientLastName: "Manual", phone: "+54 11 5555-0707", street: "Calle Fase", streetNumber: "700", floorApartment: "2 B", city: "CABA", province: "Buenos Aires", postalCode: "C1000", references: "Fixture local", isDefault: true } } } },
  }, include: { customer: true } });
  if (!customerUser.customer) throw new Error("No se pudo crear el cliente fixture.");
  const now = new Date();
  const cart = await prisma.cart.create({ data: { customerId: customerUser.customer.id, status: "CONVERTED", expiresAt: new Date(now.getTime() + 86_400_000) } });
  const price = variant.promotionalPriceInCents ?? variant.priceInCents;
  const order = await prisma.order.create({ data: {
    cartId: cart.id, customerId: customerUser.customer.id, shippingMethodId: pickup.id, checkoutKeyHash: sha256(randomUUID()), status: "CANCELLED",
    buyerFirstName: "Cliente", buyerLastName: "Manual", buyerEmail: fixtureEmails[2], buyerPhone: "+54 11 5555-0707", shippingMethodName: pickup.name,
    shippingMethodType: pickup.type, shippingRequiresAddress: false, itemsSubtotalInCents: price, shippingAmountInCents: 0n, totalInCents: price,
    paymentExpiresAt: new Date(now.getTime() + 900_000), reservationReleasedAt: now,
    items: { create: { productId: variant.product.id, productVariantId: variant.id, productName: variant.product.name, variantName: variant.name, sku: variant.sku, unitPriceInCents: price, quantity: 1, subtotalInCents: price } },
    statusHistory: { create: [{ fromStatus: null, toStatus: "PENDING_PAYMENT", reason: "Fixture manual local de FASE 7.", createdAt: now }, { fromStatus: "PENDING_PAYMENT", toStatus: "CANCELLED", reason: "Fixture sin reserva física.", createdAt: new Date(now.getTime() + 1) }] },
  } });
  await prisma.customerNote.create({ data: { customerId: customerUser.customer.id, actorUserId: fullAdmin.id, content: "Nota privada temporal para validar el backoffice." } });
  console.info(JSON.stringify({ status: "created", adminEmail: fixtureEmails[0], limitedEmail: fixtureEmails[1], customerId: customerUser.customer.id, orderId: order.id, orderNumber: order.number.toString() }));
}

async function cleanup(): Promise<void> {
  const users = await prisma.user.findMany({ where: { email: { in: [...fixtureEmails] } }, select: { id: true, customer: { select: { id: true, carts: { select: { id: true } }, orders: { select: { id: true } } } } } });
  const userIds = users.map(({ id }) => id);
  const fixtureMovements = await prisma.inventoryMovement.findMany({
    where: { adminUserId: { in: userIds }, referenceType: "manual_admin_adjustment", reason: { startsWith: "Fixture manual FASE 7" } },
    select: { id: true, inventoryId: true, quantity: true },
  });
  const movementBalance = new Map<string, number>();
  for (const movement of fixtureMovements) movementBalance.set(movement.inventoryId, (movementBalance.get(movement.inventoryId) ?? 0) + movement.quantity);
  if ([...movementBalance.values()].some((quantity) => quantity !== 0)) {
    throw new Error("No se pueden limpiar ajustes FASE 7 sin su movimiento compensatorio.");
  }
  const customer = users.find((user) => user.customer)?.customer;
  if (customer) {
    const orderIds = customer.orders.map(({ id }) => id);
    await prisma.auditLog.deleteMany({ where: { OR: [{ entityType: "Customer", entityId: customer.id }, { entityType: "Order", entityId: { in: orderIds } }] } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.cart.deleteMany({ where: { id: { in: customer.carts.map(({ id }) => id) } } });
    await prisma.customer.delete({ where: { id: customer.id } });
  }
  await prisma.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
  await prisma.inventoryMovement.deleteMany({ where: { id: { in: fixtureMovements.map(({ id }) => id) } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.role.deleteMany({ where: { code: "PHASE7_LIMITED" } });
  if (command === "cleanup") console.info(JSON.stringify({ status: "clean", users: users.length }));
}

function assertLocalDatabase(value: string): void {
  if (process.env.NODE_ENV === "production") throw new Error("Los fixtures FASE 7 están deshabilitados en producción.");
  if (!["localhost", "127.0.0.1", "::1"].includes(new URL(value).hostname)) throw new Error("Los fixtures FASE 7 solo pueden ejecutarse contra PostgreSQL local.");
}

function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
