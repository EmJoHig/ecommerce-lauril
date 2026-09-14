"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentCustomer } from "@/modules/customers/presentation/customer-session";
import { deleteGuestCartCookie, getGuestCartToken } from "@/modules/cart/presentation/guest-cart-cookie";
import { hashGuestCartToken } from "@/modules/cart/domain/guest-cart-token";
import { DomainError } from "@/shared/domain/errors";
import { assertRateLimit } from "@/shared/infrastructure/rate-limit";
import { resolveRequestIp } from "@/shared/infrastructure/request-ip";
import { getCheckoutService } from "../infrastructure/order-composition";
import type { ConfirmCheckoutInput } from "../application/checkout-service";
import type { CheckoutActionState, CheckoutFormValues } from "./checkout-action-state";
import { setGuestOrderCookie } from "./guest-order-cookie";

const formSchema = z.object({
  checkoutKey: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  shippingMethodId: z.uuid(),
  firstName: z.string().trim().max(100),
  lastName: z.string().trim().max(100),
  email: z.string().trim().max(320),
  phone: z.string().trim().max(30),
  addressMode: z.enum(["saved", "new"]),
  savedAddressId: z.string().trim(),
  recipientFirstName: z.string().trim().max(100),
  recipientLastName: z.string().trim().max(100),
  shippingPhone: z.string().trim().max(30),
  street: z.string().trim().max(160),
  streetNumber: z.string().trim().max(30),
  floorApartment: z.string().trim().max(80),
  city: z.string().trim().max(120),
  province: z.string().trim().max(120),
  postalCode: z.string().trim().max(20),
  references: z.string().trim().max(500),
});

const guestBuyerSchema = z.object({
  firstName: z.string().trim().min(1, "El nombre es obligatorio.").max(100, "El nombre admite hasta 100 caracteres."),
  lastName: z.string().trim().min(1, "El apellido es obligatorio.").max(100, "El apellido admite hasta 100 caracteres."),
  email: z.string().trim().pipe(z.email("Ingresá un email válido.").max(320, "El email admite hasta 320 caracteres.")),
  phone: z.string().trim()
    .min(1, "El teléfono es obligatorio.")
    .max(30, "El teléfono admite hasta 30 caracteres.")
    .regex(/^[+()0-9 .-]+$/, "Ingresá un teléfono válido.")
    .refine((phone) => phone.length >= 6, "Ingresá un teléfono válido."),
});

export async function confirmCheckoutAction(
  _previous: CheckoutActionState,
  formData: FormData,
): Promise<CheckoutActionState> {
  const values = checkoutFormValues(formData);
  const parsed = formSchema.safeParse({ checkoutKey: formData.get("checkoutKey"), ...values });
  if (!parsed.success) return invalidFields(parsed.error, values);
  const customer = await getCurrentCustomer();
  if (!customer) {
    const buyer = guestBuyerSchema.safeParse(parsed.data);
    if (!buyer.success) return invalidFields(buyer.error, values);
  }
  const guestToken = customer ? null : await getGuestCartToken();
  if (!customer && !guestToken) return failure("No se encontró un carrito activo.", values);
  const identity = customer?.id ?? hashGuestCartToken(guestToken!);
  const requestHeaders = await headers();
  const ip = resolveRequestIp(requestHeaders) ?? "unknown";
  let orderNumber: string;
  try {
    assertRateLimit({ scope: "checkout-confirm:ip", identity: ip, limit: 20, windowMs: 10 * 60_000 });
    assertRateLimit({ scope: "checkout-confirm:owner", identity, limit: 8, windowMs: 10 * 60_000 });
    const data = parsed.data;
    const input: ConfirmCheckoutInput = {
      owner: customer
        ? { kind: "customer", customerId: customer.id }
        : { kind: "guest", tokenHash: hashGuestCartToken(guestToken!) },
      checkoutKey: data.checkoutKey,
      shippingMethodId: data.shippingMethodId,
      ...(!customer ? { guestBuyer: { firstName: data.firstName, lastName: data.lastName, email: data.email, phone: data.phone } } : {}),
      savedAddressId: data.addressMode === "saved" && data.savedAddressId ? data.savedAddressId : null,
      newAddress: data.addressMode === "new" ? {
        label: "Checkout",
        recipientFirstName: data.recipientFirstName,
        recipientLastName: data.recipientLastName,
        phone: data.shippingPhone,
        street: data.street,
        streetNumber: data.streetNumber,
        floorApartment: data.floorApartment,
        city: data.city,
        province: data.province,
        postalCode: data.postalCode,
        references: data.references,
        isDefault: false,
      } : null,
    };
    const result = await getCheckoutService().confirm(input);
    orderNumber = result.order.number.toString();
    if (guestToken) {
      await setGuestOrderCookie(orderNumber, guestToken);
      await deleteGuestCartCookie();
    }
    revalidatePath("/", "layout");
    revalidatePath("/carrito");
  } catch (error) {
    return failure(error instanceof DomainError ? error.message : "No se pudo confirmar el pedido. Volvé a intentarlo.", values);
  }
  redirect(`/pedido/${orderNumber}`);
}

function invalidFields(error: z.ZodError, values: CheckoutFormValues): CheckoutActionState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) fieldErrors[String(issue.path[0] ?? "form")] ??= issue.message;
  return { status: "error", message: "Revisá los campos indicados.", fieldErrors, values };
}

function failure(message: string, values: CheckoutFormValues): CheckoutActionState {
  return { status: "error", message, values };
}

function checkoutFormValues(formData: FormData): CheckoutFormValues {
  const value = (name: string) => {
    const entry = formData.get(name);
    return typeof entry === "string" ? entry : "";
  };
  return {
    shippingMethodId: value("shippingMethodId"),
    firstName: value("firstName"),
    lastName: value("lastName"),
    email: value("email"),
    phone: value("phone"),
    addressMode: value("addressMode") === "saved" ? "saved" : "new",
    savedAddressId: value("savedAddressId"),
    recipientFirstName: value("recipientFirstName"),
    recipientLastName: value("recipientLastName"),
    shippingPhone: value("shippingPhone"),
    street: value("street"),
    streetNumber: value("streetNumber"),
    floorApartment: value("floorApartment"),
    city: value("city"),
    province: value("province"),
    postalCode: value("postalCode"),
    references: value("references"),
  };
}
