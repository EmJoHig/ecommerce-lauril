import { createHmac, timingSafeEqual } from "node:crypto";

const SHA256_HEX_LENGTH = 64;

export type MercadoPagoWebhookSignatureInput = Readonly<{
  signature: string | null;
  requestId: string | null;
  dataId: string | null;
  secret: string;
}>;

export function verifyMercadoPagoWebhookSignature(
  input: MercadoPagoWebhookSignatureInput,
): boolean {
  const requestId = input.requestId;
  const dataId = input.dataId;
  const secret = input.secret.trim();
  if (!input.signature || !requestId || !dataId || !secret) return false;
  if (requestId !== requestId.trim() || dataId !== dataId.trim()) return false;

  const parsed = parseSignature(input.signature);
  if (!parsed) return false;

  const manifest = `id:${dataId};request-id:${requestId};ts:${parsed.timestamp};`;
  const expected = createHmac("sha256", secret).update(manifest).digest();
  const received = Buffer.from(parsed.hash, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function parseSignature(value: string): Readonly<{ timestamp: string; hash: string }> | null {
  const entries = value.split(",").map((part) => part.trim());
  const values = new Map<string, string>();
  for (const entry of entries) {
    const separator = entry.indexOf("=");
    if (separator <= 0 || separator === entry.length - 1) return null;
    const key = entry.slice(0, separator).trim();
    const item = entry.slice(separator + 1).trim();
    if (values.has(key)) return null;
    values.set(key, item);
  }

  const timestamp = values.get("ts");
  const hash = values.get("v1");
  if (!timestamp || !/^\d+$/.test(timestamp)) return null;
  if (!hash || hash.length !== SHA256_HEX_LENGTH || !/^[a-f\d]+$/i.test(hash)) return null;
  return { timestamp, hash };
}
