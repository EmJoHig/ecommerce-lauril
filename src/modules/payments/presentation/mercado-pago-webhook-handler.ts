import { z } from "zod";
import { ValidationError } from "@/shared/domain/errors";
import { logger } from "@/shared/infrastructure/logger";
import type { ProcessMercadoPagoWebhook } from "../application/process-mercado-pago-webhook";
import { PaymentWebhookTechnicalError } from "../application/process-mercado-pago-webhook";
import { verifyMercadoPagoWebhookSignature } from "../infrastructure/mercado-pago-webhook-signature";

const webhookBodySchema = z.object({
  id: z.union([z.string().trim().min(1).max(255), z.number().int().safe()]).transform(String).optional(),
  action: z.string().trim().min(1).max(255),
  type: z.string().trim().min(1).max(80),
  data: z.object({ id: z.string().min(1).max(255) }),
}).strip();
const MAX_WEBHOOK_BODY_BYTES = 16 * 1024;

export type MercadoPagoWebhookHandlerOptions = Readonly<{
  enabled: boolean;
  secret: string | undefined;
  processor: Pick<ProcessMercadoPagoWebhook, "execute"> | null;
}>;

export async function handleMercadoPagoWebhook(
  request: Request,
  options: MercadoPagoWebhookHandlerOptions,
): Promise<Response> {
  if (!options.enabled || !options.secret || !options.processor) {
    return jsonResponse(503);
  }

  const url = new URL(request.url);
  const providerResourceId = url.searchParams.get("data.id");
  const queryType = url.searchParams.get("type");
  const requestId = request.headers.get("x-request-id");
  const signatureResult = verifyMercadoPagoWebhookSignature({
    signature: request.headers.get("x-signature"),
    requestId,
    dataId: providerResourceId,
    secret: options.secret,
  });
  if (!signatureResult.valid) {
    logger.warn("payment.webhook_invalid_signature", { provider: "MERCADO_PAGO", reasonCode: signatureResult.reasonCode });
    return jsonResponse(401);
  }

  let rawBody: unknown;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_WEBHOOK_BODY_BYTES) return jsonResponse(400);
    rawBody = JSON.parse(body);
  } catch {
    return jsonResponse(400);
  }
  const parsed = webhookBodySchema.safeParse(rawBody);
  if (
    !parsed.success
    || !providerResourceId
    || !requestId
    || !queryType
    || parsed.data.type !== queryType
    || parsed.data.data.id !== providerResourceId
  ) {
    return jsonResponse(400);
  }

  const providerEventId = parsed.data.id ?? `request:${requestId}`;
  if (providerEventId.length > 255) return jsonResponse(400);

  try {
    const outcome = await options.processor.execute({
      providerEventId,
      providerResourceId,
      eventType: parsed.data.type,
      action: parsed.data.action,
      requestId,
    });
    if (outcome.kind === "approved") {
      logger.info("payment.approved", {
        provider: "MERCADO_PAGO",
        orderNumber: outcome.orderNumber?.toString(),
      });
    } else if (outcome.kind === "requires_review") {
      logger.warn("payment.requires_review", {
        provider: "MERCADO_PAGO",
        reasonCode: outcome.reasonCode,
        orderNumber: outcome.orderNumber?.toString(),
      });
    }
    return jsonResponse(200);
  } catch (error) {
    if (error instanceof ValidationError) return jsonResponse(400);
    logger.error("payment.webhook_failed", {
      provider: "MERCADO_PAGO",
      reasonCode: error instanceof PaymentWebhookTechnicalError ? "technical_processing_failure" : "unexpected_failure",
    });
    return jsonResponse(503);
  }
}

function jsonResponse(status: number): Response {
  return Response.json({ status: status >= 200 && status < 300 ? "ok" : "error" }, { status });
}
