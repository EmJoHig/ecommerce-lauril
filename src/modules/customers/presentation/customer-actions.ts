"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DomainError } from "@/shared/domain/errors";
import { assertRateLimit } from "@/shared/infrastructure/rate-limit";
import { logger } from "@/shared/infrastructure/logger";
import { getCartService } from "@/modules/cart/infrastructure/cart-composition";
import { deleteGuestCartCookie, getGuestCartTokenHash } from "@/modules/cart/presentation/guest-cart-cookie";
import { getCustomerService } from "../infrastructure/customer-composition";
import type { CustomerAddressInput } from "../domain/customer";
import type { CustomerActionState } from "./customer-action-state";
import {
  deleteCustomerSessionCookie,
  getCustomerSessionToken,
  setCustomerSessionCookie,
} from "./customer-session-cookie";
import { requireCustomer } from "./customer-session";

const profileFields = {
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(6).max(30),
  document: z.string().trim().max(50).optional().default(""),
};
const registerSchema = z.object({
  ...profileFields,
  email: z.email().max(320),
  password: z.string().min(1).max(128),
  passwordConfirmation: z.string().min(1).max(128),
});
const loginSchema = z.object({ email: z.email().max(320), password: z.string().min(1).max(128) });
const recoverySchema = z.object({ email: z.email().max(320) });
const resetSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  password: z.string().min(1).max(128),
  passwordConfirmation: z.string().min(1).max(128),
});
const profileSchema = z.object(profileFields);
const addressSchema = z.object({
  addressId: z.uuid().optional(),
  label: z.string().trim().min(1).max(80),
  recipientFirstName: z.string().trim().min(1).max(100),
  recipientLastName: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(6).max(30),
  street: z.string().trim().min(1).max(160),
  streetNumber: z.string().trim().min(1).max(30),
  floorApartment: z.string().trim().max(80).optional().default(""),
  city: z.string().trim().min(1).max(120),
  province: z.string().trim().min(1).max(120),
  postalCode: z.string().trim().min(1).max(20),
  references: z.string().trim().max(500).optional().default(""),
  isDefault: z.string().optional(),
});
const addressIdSchema = z.object({ addressId: z.uuid() });

export async function registerCustomerAction(
  _previous: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const parsed = registerSchema.safeParse(formObject(formData, [
    "firstName", "lastName", "phone", "document", "email", "password", "passwordConfirmation",
  ]));
  if (!parsed.success) return invalidFields(parsed.error);
  const context = await requestContext();
  let session;
  try {
    limitAuthentication("register", parsed.data.email, context.ipAddress, 5);
    session = await getCustomerService().register(parsed.data, context);
  } catch (error) {
    return failure(error, "No pudimos crear la cuenta. Revisá los datos e intentá nuevamente.");
  }
  return finishAuthentication(session.token, session.expiresAt, session.customer.id);
}

export async function loginCustomerAction(
  _previous: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const parsed = loginSchema.safeParse(formObject(formData, ["email", "password"]));
  if (!parsed.success) return failure(null, "Email o contraseña incorrectos.");
  const context = await requestContext();
  let session;
  try {
    limitAuthentication("login", parsed.data.email, context.ipAddress, 8);
    session = await getCustomerService().login(parsed.data, context);
  } catch (error) {
    return failure(error, "Email o contraseña incorrectos.");
  }
  return finishAuthentication(session.token, session.expiresAt, session.customer.id);
}

export async function logoutCustomerAction(): Promise<never> {
  const token = await getCustomerSessionToken();
  if (token) await getCustomerService().logout(token);
  await deleteCustomerSessionCookie();
  revalidatePath("/", "layout");
  redirect("/login?logout=1");
}

export async function requestPasswordResetAction(
  _previous: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const parsed = recoverySchema.safeParse(formObject(formData, ["email"]));
  const genericMessage = "Si el email corresponde a una cuenta activa, preparamos las instrucciones de recuperación.";
  if (!parsed.success) return { status: "success", message: genericMessage };
  const context = await requestContext();
  try {
    limitAuthentication("password-reset", parsed.data.email, context.ipAddress, 4);
    const delivery = await getCustomerService().requestPasswordReset(parsed.data.email, context);
    return {
      status: "success",
      message: genericMessage,
      developmentPreviewUrl: delivery.developmentPreviewUrl,
    };
  } catch (error) {
    if (error instanceof DomainError) return failure(error, genericMessage);
    throw error;
  }
}

export async function resetPasswordAction(
  _previous: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const parsed = resetSchema.safeParse(formObject(formData, ["token", "password", "passwordConfirmation"]));
  if (!parsed.success) return invalidFields(parsed.error);
  const context = await requestContext();
  try {
    limitAuthentication("password-reset-complete", parsed.data.token.slice(0, 8), context.ipAddress, 6);
    await getCustomerService().resetPassword(parsed.data, context.ipAddress);
  } catch (error) {
    return failure(error, "No se pudo actualizar la contraseña.");
  }
  redirect("/login?reset=success");
}

export async function updateCustomerProfileAction(
  _previous: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const customer = await requireCustomer();
  const parsed = profileSchema.safeParse(formObject(formData, ["firstName", "lastName", "phone", "document"]));
  if (!parsed.success) return invalidFields(parsed.error);
  try {
    await getCustomerService().updateProfile(customer.id, parsed.data);
    revalidatePath("/mi-cuenta", "layout");
    return { status: "success", message: "Datos personales actualizados." };
  } catch (error) {
    return failure(error, "No se pudieron actualizar los datos.");
  }
}

export async function saveCustomerAddressAction(
  _previous: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const customer = await requireCustomer();
  const parsed = addressSchema.safeParse(formObject(formData, [
    "addressId", "label", "recipientFirstName", "recipientLastName", "phone", "street",
    "streetNumber", "floorApartment", "city", "province", "postalCode", "references", "isDefault",
  ]));
  if (!parsed.success) return invalidFields(parsed.error);
  const { addressId, isDefault, ...data } = parsed.data;
  const input: CustomerAddressInput = { ...data, isDefault: isDefault === "on" };
  try {
    if (addressId) await getCustomerService().updateAddress(customer.id, addressId, input);
    else await getCustomerService().createAddress(customer.id, input);
    revalidatePath("/mi-cuenta/direcciones");
    return { status: "success", message: addressId ? "Dirección actualizada." : "Dirección agregada." };
  } catch (error) {
    return failure(error, "No se pudo guardar la dirección.");
  }
}

export async function deleteCustomerAddressAction(formData: FormData): Promise<void> {
  const customer = await requireCustomer();
  const parsed = addressIdSchema.safeParse(formObject(formData, ["addressId"]));
  if (!parsed.success) return;
  await getCustomerService().deleteAddress(customer.id, parsed.data.addressId);
  revalidatePath("/mi-cuenta/direcciones");
}

export async function defaultCustomerAddressAction(formData: FormData): Promise<void> {
  const customer = await requireCustomer();
  const parsed = addressIdSchema.safeParse(formObject(formData, ["addressId"]));
  if (!parsed.success) return;
  await getCustomerService().setDefaultAddress(customer.id, parsed.data.addressId);
  revalidatePath("/mi-cuenta/direcciones");
}

async function finishAuthentication(token: string, expiresAt: Date, customerId: string): Promise<never> {
  await setCustomerSessionCookie(token, expiresAt);
  let mergeStatus = "ok";
  try {
    const merge = await getCartService().mergeGuestCart(customerId, await getGuestCartTokenHash());
    await deleteGuestCartCookie();
    if (merge.adjustedLines > 0 || merge.removedLines > 0) {
      mergeStatus = `ajustado-${merge.adjustedLines}-${merge.removedLines}`;
    } else if (merge.merged) {
      mergeStatus = "fusionado";
    }
  } catch {
    mergeStatus = "pendiente";
    logger.warn("customer.cart_merge_failed", { customerId });
  }
  revalidatePath("/", "layout");
  redirect(`/mi-cuenta?carrito=${mergeStatus}`);
}

async function requestContext() {
  const requestHeaders = await headers();
  return {
    ipAddress: requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: requestHeaders.get("user-agent")?.slice(0, 500) ?? null,
  };
}

function limitAuthentication(scope: string, emailOrToken: string, ipAddress: string | null, limit: number): void {
  assertRateLimit({
    scope,
    identity: `${ipAddress ?? "unknown"}:${emailOrToken.trim().toLowerCase()}`,
    limit,
    windowMs: 15 * 60_000,
  });
}

function formObject(formData: FormData, fields: string[]): Record<string, FormDataEntryValue | undefined> {
  return Object.fromEntries(fields.map((field) => [field, formData.get(field) ?? undefined]));
}

function invalidFields(error: z.ZodError): CustomerActionState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    fieldErrors[field] ??= "Revisá este dato.";
  }
  return { status: "error", message: "Revisá los campos indicados.", fieldErrors };
}

function failure(error: unknown, fallback: string): CustomerActionState {
  return {
    status: "error",
    message: error instanceof DomainError ? error.message : fallback,
  };
}
