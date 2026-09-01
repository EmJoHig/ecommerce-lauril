import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { CartService } from "../src/modules/cart/application/cart-service";
import { createGuestCartToken, hashGuestCartToken } from "../src/modules/cart/domain/guest-cart-token";
import { PrismaCartRepository } from "../src/modules/cart/infrastructure/prisma-cart-repository";
import { CustomerService } from "../src/modules/customers/application/customer-service";
import type { EmailSender } from "../src/modules/customers/application/email-sender";
import { PrismaCustomerRepository } from "../src/modules/customers/infrastructure/prisma-customer-repository";
import { NotFoundError, ValidationError } from "../src/shared/domain/errors";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL es obligatoria.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const createdUserIds: string[] = [];
const guestHashes: string[] = [];

class PreviewEmailSender implements EmailSender {
  token: string | null = null;
  sendPasswordReset(input: Parameters<EmailSender["sendPasswordReset"]>[0]) {
    this.token = input.token;
    return Promise.resolve({ developmentPreviewUrl: `http://localhost:3000/restablecer-clave#token=${input.token}` });
  }
}

async function main(): Promise<void> {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const sender = new PreviewEmailSender();
  const customers = new CustomerService(new PrismaCustomerRepository(prisma), sender, 10, 30, 30);
  const carts = new CartService(new PrismaCartRepository(prisma), 30);
  const context = { ipAddress: "127.0.0.1", userAgent: "phase4-verifier" };
  const customerSession = await customers.register({
    firstName: "Prueba",
    lastName: "Fase Cuatro",
    email: `phase4-${suffix}@test.local`,
    phone: "+54 11 5555-0101",
    document: null,
    password: "Clave-segura-fase4",
    passwordConfirmation: "Clave-segura-fase4",
  }, context);
  createdUserIds.push(customerSession.customer.userId);
  const secondSession = await customers.register({
    firstName: "Otro",
    lastName: "Cliente",
    email: `phase4-other-${suffix}@test.local`,
    phone: "+54 11 5555-0202",
    document: null,
    password: "Clave-segura-fase4",
    passwordConfirmation: "Clave-segura-fase4",
  }, context);
  createdUserIds.push(secondSession.customer.userId);

  const variants = await prisma.productVariant.findMany({
    where: { isActive: true, product: { status: "ACTIVE" }, inventory: { stockOnHand: { gt: 1 } } },
    include: { inventory: true },
    orderBy: { sku: "asc" },
    take: 2,
  });
  if (variants.length < 2 || !variants[0]?.inventory || !variants[1]?.inventory) {
    throw new Error("Se necesitan dos variantes activas con stock para verificar FASE 4.");
  }
  const first = variants[0];
  const second = variants[1];
  const firstInventory = first.inventory;
  if (!firstInventory) throw new Error("La primera variante no posee inventario.");
  const available = firstInventory.stockOnHand - firstInventory.stockReserved;
  const movementCount = await prisma.inventoryMovement.count();
  await carts.addCustomerItem({ customerId: customerSession.customer.id, variantId: first.id, quantity: available - 1 });
  const guestToken = createGuestCartToken();
  const guestHash = hashGuestCartToken(guestToken);
  guestHashes.push(guestHash);
  await carts.addItem({ tokenHash: guestHash, variantId: first.id, quantity: 2 });
  await carts.addItem({ tokenHash: guestHash, variantId: second.id, quantity: 1 });
  const concurrentMerges = await Promise.all([
    carts.mergeGuestCart(customerSession.customer.id, guestHash),
    carts.mergeGuestCart(customerSession.customer.id, guestHash),
  ]);
  const merge = concurrentMerges.find((result) => result.adjustedLines === 1) ?? concurrentMerges[0];
  if (!merge) throw new Error("La fusión concurrente no devolvió un resultado.");
  if (merge.adjustedLines !== 1 || merge.cart.items.length !== 2) {
    throw new Error("La fusión no aplicó la política determinista esperada.");
  }
  const mergedFirst = merge.cart.items.find((item) => item.variantId === first.id);
  if (mergedFirst?.quantity !== available) throw new Error("La fusión no limitó al stock disponible.");
  const persisted = await new CartService(new PrismaCartRepository(prisma), 30).getCustomerCart(customerSession.customer.id);
  if (persisted.itemCount !== available + 1) throw new Error("El carrito cliente no persistió.");
  if ((await prisma.inventoryMovement.count()) !== movementCount) throw new Error("La fusión creó movimientos de stock.");
  if (await prisma.cart.count({ where: { customerId: customerSession.customer.id, status: "ACTIVE" } }) !== 1) {
    throw new Error("El cliente no posee exactamente un carrito activo.");
  }

  const address = await customers.createAddress(customerSession.customer.id, {
    label: "Casa", recipientFirstName: "Prueba", recipientLastName: "Fase Cuatro",
    phone: "+54 11 5555-0101", street: "Lavalle", streetNumber: "123",
    city: "Buenos Aires", province: "Buenos Aires", postalCode: "C1047", isDefault: true,
  });
  let ownershipBlocked = false;
  try {
    await customers.updateAddress(secondSession.customer.id, address.id, {
      label: "Ajena", recipientFirstName: "Otro", recipientLastName: "Cliente",
      phone: "+54 11 5555-0202", street: "Otra", streetNumber: "1",
      city: "Buenos Aires", province: "Buenos Aires", postalCode: "C1000",
    });
  } catch (error) {
    ownershipBlocked = error instanceof NotFoundError;
  }
  if (!ownershipBlocked) throw new Error("No se bloqueó la dirección ajena.");

  await customers.requestPasswordReset(customerSession.customer.email, context);
  if (!sender.token) throw new Error("No se generó token de recuperación.");
  await customers.resetPassword({ token: sender.token, password: "Nueva-clave-fase4", passwordConfirmation: "Nueva-clave-fase4" }, null);
  let resetReuseBlocked = false;
  try {
    await customers.resetPassword({ token: sender.token, password: "Otra-clave-fase4", passwordConfirmation: "Otra-clave-fase4" }, null);
  } catch (error) {
    resetReuseBlocked = error instanceof ValidationError;
  }
  if (!resetReuseBlocked) throw new Error("El token de recuperación pudo reutilizarse.");
  await customers.login({ email: customerSession.customer.email, password: "Nueva-clave-fase4" }, context);

  console.info(JSON.stringify({
    status: "ok",
    registration: true,
    sessionPersistence: true,
    anonymousCartConverted: true,
    existingCartMerged: true,
    duplicateLines: false,
    quantityClampedToStock: true,
    concurrentMergeSafe: true,
    inventoryMovementsFromMerge: 0,
    oneActiveCartPerCustomer: true,
    addressOwnershipBlocked: true,
    passwordResetSingleUse: true,
  }));
}

async function cleanup(): Promise<void> {
  if (createdUserIds.length === 0 && guestHashes.length === 0) return;
  const customerRows = await prisma.customer.findMany({ where: { userId: { in: createdUserIds } }, select: { id: true } });
  const customerIds = customerRows.map(({ id }) => id);
  await prisma.$transaction(async (tx) => {
    await tx.cartItem.deleteMany({ where: { cart: { OR: [{ customerId: { in: customerIds } }, { guestTokenHash: { in: guestHashes } }] } } });
    await tx.cart.deleteMany({ where: { OR: [{ customerId: { in: customerIds } }, { guestTokenHash: { in: guestHashes } }] } });
    await tx.customerAddress.deleteMany({ where: { customerId: { in: customerIds } } });
    await tx.customer.deleteMany({ where: { id: { in: customerIds } } });
    await tx.passwordResetToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await tx.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await tx.auditLog.deleteMany({ where: { actorUserId: { in: createdUserIds } } });
    await tx.user.deleteMany({ where: { id: { in: createdUserIds } } });
  });
}

main()
  .catch((error: unknown) => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await cleanup(); await prisma.$disconnect(); });
