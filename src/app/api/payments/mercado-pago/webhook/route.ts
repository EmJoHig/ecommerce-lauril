import { getServerEnv } from "@/shared/infrastructure/env";
import { getMercadoPagoWebhookProcessor } from "@/modules/payments/infrastructure/payment-composition";
import { handleMercadoPagoWebhook } from "@/modules/payments/presentation/mercado-pago-webhook-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  const env = getServerEnv();
  const configured = env.MERCADO_PAGO_ENABLED
    && Boolean(env.MERCADO_PAGO_ACCESS_TOKEN)
    && Boolean(env.MERCADO_PAGO_WEBHOOK_SECRET);
  return handleMercadoPagoWebhook(request, {
    enabled: env.MERCADO_PAGO_ENABLED,
    secret: env.MERCADO_PAGO_WEBHOOK_SECRET,
    processor: configured ? getMercadoPagoWebhookProcessor() : null,
  });
}
