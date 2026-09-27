"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/modules/customers/presentation/customer-session";
import { getOrderQueryService } from "@/modules/orders/infrastructure/order-composition";
import { parseOrderNumber } from "@/modules/orders/domain/order";
import { secureCheckoutUrl } from "../application/payment-redirect";
import { getStartPaymentCheckout, isMercadoPagoCheckoutAvailable } from "../infrastructure/payment-composition";
import { assertRateLimit } from "@/shared/infrastructure/rate-limit";
import { resolveRequestIp } from "@/shared/infrastructure/request-ip";
import { logger } from "@/shared/infrastructure/logger";

export async function startPaymentCheckoutAction(orderNumberValue: string, formData: FormData): Promise<never> {
  void formData;
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/login");
  let returnPath = "/";
  let destination = returnPath;
  try {
    const orderNumber = parseOrderNumber(orderNumberValue);
    returnPath = `/pedido/${orderNumber.toString()}`;
    destination = `${returnPath}?payment_error=unavailable`;
    const order = await getOrderQueryService().findPublic(orderNumber.toString(), {
      customerId: customer.id,
      guestTokenHash: null,
    });
    const requestHeaders = await headers();
    const ip = resolveRequestIp(requestHeaders) ?? "unknown";
    const ownerIdentity = customer.id;
    assertRateLimit({ scope: "payment-checkout:ip", identity: ip, limit: 20, windowMs: 10 * 60_000 });
    assertRateLimit({ scope: "payment-checkout:owner", identity: ownerIdentity, limit: 8, windowMs: 10 * 60_000 });

    if (!isMercadoPagoCheckoutAvailable()) throw new Error("Mercado Pago no disponible.");
    const result = await getStartPaymentCheckout().execute(order.id, customer.id);
    destination = secureCheckoutUrl(result.checkoutUrl);
  } catch (error) {
    logger.warn("payment.checkout_start_failed", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
  }
  redirect(destination);
}
