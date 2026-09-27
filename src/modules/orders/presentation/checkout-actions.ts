"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentCustomer } from "@/modules/customers/presentation/customer-session";
import { DomainError } from "@/shared/domain/errors";
import { assertRateLimit } from "@/shared/infrastructure/rate-limit";
import { resolveRequestIp } from "@/shared/infrastructure/request-ip";
import { getCheckoutService } from "../infrastructure/order-composition";
import type { ConfirmCheckoutInput } from "../application/checkout-service";
import type { CheckoutActionState, CheckoutFormValues } from "./checkout-action-state";

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

export async function confirmCheckoutAction(
  _previous: CheckoutActionState,
  formData: FormData,
): Promise<CheckoutActionState> {
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/login?returnTo=/checkout");
  const values = checkoutFormValues(formData);
  const parsed = formSchema.safeParse({ checkoutKey: formData.get("checkoutKey"), ...values });
  if (!parsed.success) return invalidFields(parsed.error, values);
  const identity = customer.id;
  const requestHeaders = await headers();
  const ip = resolveRequestIp(requestHeaders) ?? "unknown";
  let orderNumber: string;
  try {
    assertRateLimit({ scope: "checkout-confirm:ip", identity: ip, limit: 20, windowMs: 10 * 60_000 });
    assertRateLimit({ scope: "checkout-confirm:owner", identity, limit: 8, windowMs: 10 * 60_000 });
    const data = parsed.data;
    const input: ConfirmCheckoutInput = {
      owner: { kind: "customer", customerId: customer.id },
      checkoutKey: data.checkoutKey,
      shippingMethodId: data.shippingMethodId,
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
