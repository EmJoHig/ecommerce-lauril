import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { verifyMercadoPagoWebhookSignature } from "@/modules/payments/infrastructure/mercado-pago-webhook-signature";
import { handleMercadoPagoWebhook } from "@/modules/payments/presentation/mercado-pago-webhook-handler";
import { logger } from "@/shared/infrastructure/logger";

const secret = "WEBHOOK_SECRET_FOR_TESTS";
const dataId = "ORDTST01M30AJEA9DP593R9KCZRDRZY1";
const requestId = "req-1";
const timestamp = "1758196800";
const hash = createHmac("sha256", secret)
  .update(`id:${dataId};request-id:${requestId};ts:${timestamp};`).digest("hex");
const signature = `ts=${timestamp},v1=${hash}`;
const input = { signature, requestId, dataId, secret };

describe("firma SDK compatible", () => {
  it("normaliza espacios exteriores sin alterar casing ni espacios internos", () => {
    expect(verifyMercadoPagoWebhookSignature({
      ...input, signature: `  ts = ${timestamp} , v1 = ${hash}  `,
      requestId: ` ${requestId}\t`, dataId: `\t${dataId} `,
    })).toEqual({ valid: true });
    expect(verifyMercadoPagoWebhookSignature({ ...input, dataId: `${dataId} X` }))
      .toEqual({ valid: false, reasonCode: "signature_mismatch" });
  });

  it("reconoce claves TS/V1 con distinto casing", () => {
    for (const signature of [`TS=${timestamp},V1=${hash}`, `Ts=${timestamp},v1=${hash}`]) {
      expect(verifyMercadoPagoWebhookSignature({ ...input, signature })).toEqual({ valid: true });
    }
  });

  it("ignora entradas desconocidas y usa el último valor reconocido no vacío como el SDK", () => {
    for (const signature of [
      `unknown=value,${input.signature},ignored,empty=,=value,`,
      `ts=0,v1=invalid,${input.signature},TS=,V1=`,
      `${input.signature},v2=unsupported`,
    ]) {
      expect(verifyMercadoPagoWebhookSignature({ ...input, signature })).toEqual({ valid: true });
    }
    expect(verifyMercadoPagoWebhookSignature({ ...input, signature: `${signature},V1=wrong` }))
      .toEqual({ valid: false, reasonCode: "signature_mismatch" });
  });

  it("clasifica hashes incorrectos y multibyte sin lanzar excepciones", () => {
    for (const badHash of ["0".repeat(64), "é" + "a".repeat(63), "short", `${hash}00`]) {
      expect(verifyMercadoPagoWebhookSignature({ ...input, signature: `ts=${timestamp},v1=${badHash}` }))
        .toEqual({ valid: false, reasonCode: "signature_mismatch" });
    }
  });

  it("distingue firma ausente, malformada, timestamp ausente y hash ausente", () => {
    for (const [signature, reasonCode] of [
      [null, "missing_signature"], ["  ", "missing_signature"],
      ["invalid", "malformed_signature"], ["unknown=value", "malformed_signature"],
      [`v1=${hash}`, "missing_timestamp"], [`ts=bad,v1=${hash}`, "malformed_signature"],
      [`ts=${timestamp}`, "missing_hash"], [`ts=${timestamp},v2=${hash}`, "missing_hash"],
    ] as const) {
      expect(verifyMercadoPagoWebhookSignature({ ...input, signature })).toEqual({ valid: false, reasonCode });
    }
    for (const missing of [null, "", " \t "]) {
      expect(verifyMercadoPagoWebhookSignature({ ...input, requestId: missing }))
        .toEqual({ valid: false, reasonCode: "missing_request_id" });
      expect(verifyMercadoPagoWebhookSignature({ ...input, dataId: missing }))
        .toEqual({ valid: false, reasonCode: "missing_data_id" });
    }
  });

  it("responde 401 y registra exclusivamente provider y reasonCode ante firmas inválidas", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    try {
      const execute = vi.fn();
      for (const [signature, reasonCode] of [
        [null, "missing_signature"], ["invalid", "malformed_signature"],
        [`v1=${hash}`, "missing_timestamp"], [`ts=${timestamp}`, "missing_hash"],
        [`ts=${timestamp},v1=${"0".repeat(64)}`, "signature_mismatch"],
      ] as const) {
        const request = webhookRequest(signature, "not JSON");
        expect((await handleMercadoPagoWebhook(request, { enabled: true, secret, processor: { execute } })).status).toBe(401);
        expect(warn).toHaveBeenLastCalledWith("payment.webhook_invalid_signature", { provider: "MERCADO_PAGO", reasonCode });
      }
      expect(execute).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("preserva query firmado, comparación con body y fallback del evento", async () => {
    const execute = vi.fn().mockResolvedValue({ kind: "pending" });
    const options = { enabled: true, secret, processor: { execute } };
    const body = { action: "order.processed", type: "order", data: { id: dataId } };
    expect((await handleMercadoPagoWebhook(webhookRequest(signature, JSON.stringify(body)), options)).status).toBe(200);
    expect(execute).toHaveBeenCalledWith({
      providerEventId: `request:${requestId}`, providerResourceId: dataId,
      requestId, action: "order.processed", eventType: "order",
    });
    execute.mockClear();
    const mismatched = { ...body, data: { id: dataId.toLowerCase() } };
    expect((await handleMercadoPagoWebhook(webhookRequest(signature, JSON.stringify(mismatched)), options)).status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });
});

function webhookRequest(signature: string | null, body: string): Request {
  return new Request(`https://lauril.test/api/payments/mercado-pago/webhook?data.external_reference=lauril-order-10005-attempt-1&data.id=${dataId}&type=order`, {
    method: "POST",
    headers: { "x-request-id": requestId, ...(signature === null ? {} : { "x-signature": signature }) },
    body,
  });
}
