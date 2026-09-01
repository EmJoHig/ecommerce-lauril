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
import { getCheckoutService } from "../infrastructure/order-composition";
import type { ConfirmCheckoutInput } from "../application/checkout-service";
import type { CheckoutActionState } from "./checkout-action-state";
import { setGuestOrderCookie } from "./guest-order-cookie";

const formSchema = z.object({
  checkoutKey: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  shippingMethodId: z.uuid(),
  firstName: z.string().trim().max(100).optional().default(""),
  lastName: z.string().trim().max(100).optional().default(""),
  email: z.string().trim().max(320).optional().default(""),
  phone: z.string().trim().max(30).optional().default(""),
  addressMode: z.enum(["saved", "new"]).optional().default("new"),
  savedAddressId: z.string().trim().optional().default(""),
  recipientFirstName: z.string().trim().max(100).optional().default(""),
  recipientLastName: z.string().trim().max(100).optional().default(""),
  shippingPhone: z.string().trim().max(30).optional().default(""),
  street: z.string().trim().max(160).optional().default(""),
  streetNumber: z.string().trim().max(30).optional().default(""),
  floorApartment: z.string().trim().max(80).optional().default(""),
  city: z.string().trim().max(120).optional().default(""),
  province: z.string().trim().max(120).optional().default(""),
  postalCode: z.string().trim().max(20).optional().default(""),
  references: z.string().trim().max(500).optional().default(""),
});

export async function confirmCheckoutAction(
  _previous: CheckoutActionState,
  formData: FormData,
): Promise<CheckoutActionState> {
  const parsed = formSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalidFields(parsed.error);
  const customer = await getCurrentCustomer();
  const guestToken = customer ? null : await getGuestCartToken();
  if (!customer && !guestToken) return failure("No se encontró un carrito activo.");
  const identity = customer?.id ?? hashGuestCartToken(guestToken!);
  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  let orderNumber: string;
  try {
    assertRateLimit({ scope: "checkout-confirm", identity: `${ip}:${identity}`, limit: 8, windowMs: 10 * 60_000 });
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
    return failure(error instanceof DomainError ? error.message : "No se pudo confirmar el pedido. Volvé a intentarlo.");
  }
  redirect(`/pedido/${orderNumber}`);
}

function invalidFields(error: z.ZodError): CheckoutActionState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) fieldErrors[String(issue.path[0] ?? "form")] ??= "Revisá este dato.";
  return { status: "error", message: "Revisá los campos indicados.", fieldErrors };
}

function failure(message: string): CheckoutActionState {
  return { status: "error", message };
}
