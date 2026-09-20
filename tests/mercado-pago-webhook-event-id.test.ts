import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { handleMercadoPagoWebhook } from "@/modules/payments/presentation/mercado-pago-webhook-handler";

const secret = "WEBHOOK_SECRET_FOR_TESTS";
const resourceId = "ORDTST01M305WJWR6MRC9V4XQQ9N2MP0";

describe("Mercado Pago webhook event ID", () => {
  it("acepta body sin id y conserva el fallback para la misma request firmada", async () => {
    const execute = vi.fn().mockResolvedValue({ kind: "pending" });
    for (const requestId of ["req-1", "req-1", "req-2"]) {
      const response = await handleMercadoPagoWebhook(signedRequest(requestId), {
        enabled: true, secret, processor: { execute },
      });
      expect(response.status).toBe(200);
      expect(execute).toHaveBeenLastCalledWith({
        providerEventId: `request:${requestId}`,
        providerResourceId: resourceId,
        eventType: "order",
        action: "order.processed",
        requestId,
      });
    }
    expect(execute.mock.calls.map(([input]) => input.providerEventId))
      .toEqual(["request:req-1", "request:req-1", "request:req-2"]);
  });

  it("conserva body.id string o numérico cuando existe", async () => {
    const execute = vi.fn().mockResolvedValue({ kind: "pending" });
    for (const id of ["notification-1", 123]) {
      const response = await handleMercadoPagoWebhook(signedRequest("req-1", id), {
        enabled: true, secret, processor: { execute },
      });
      expect(response.status).toBe(200);
      expect(execute).toHaveBeenLastCalledWith(expect.objectContaining({
        providerEventId: String(id), providerResourceId: resourceId,
      }));
    }
  });

  it("acepta fallback de 255 caracteres y rechaza el que excede ese límite", async () => {
    const execute = vi.fn().mockResolvedValue({ kind: "pending" });
    const options = { enabled: true, secret, processor: { execute } };
    expect((await handleMercadoPagoWebhook(signedRequest("r".repeat(247)), options)).status).toBe(200);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ providerEventId: `request:${"r".repeat(247)}` }));
    execute.mockClear();
    expect((await handleMercadoPagoWebhook(signedRequest("r".repeat(248)), options)).status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it("rechaza ausencia de x-request-id antes de invocar el processor", async () => {
    const execute = vi.fn();
    const request = signedRequest("req-1");
    request.headers.delete("x-request-id");
    const response = await handleMercadoPagoWebhook(request, {
      enabled: true, secret, processor: { execute },
    });
    expect(response.status).toBe(401);
    expect(execute).not.toHaveBeenCalled();
  });
});

function signedRequest(requestId: string, id?: string | number): Request {
  const timestamp = "1758196800";
  const hash = createHmac("sha256", secret)
    .update(`id:${resourceId};request-id:${requestId};ts:${timestamp};`)
    .digest("hex");
  return new Request(`https://lauril.test/api/payments/mercado-pago/webhook?data.id=${resourceId}&type=order`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-request-id": requestId,
      "x-signature": `ts=${timestamp},v1=${hash}`,
    },
    body: JSON.stringify({
      ...(id === undefined ? {} : { id }),
      action: "order.processed",
      api_version: "v1",
      type: "order",
      data: { id: resourceId },
    }),
  });
}
