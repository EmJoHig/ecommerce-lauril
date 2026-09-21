import { createHmac, timingSafeEqual } from "node:crypto";

export type MercadoPagoWebhookSignatureInput = Readonly<{
  signature: string | null;
  requestId: string | null;
  dataId: string | null;
  secret: string;
}>;

export type MercadoPagoWebhookSignatureResult =
  | Readonly<{ valid: true; sandboxExactCase?: true }>
  | Readonly<{
      valid: false;
      reasonCode: "missing_signature" | "malformed_signature" | "missing_timestamp"
        | "missing_hash" | "signature_mismatch"
        | "missing_request_id" | "missing_data_id" | "missing_secret";
    }>;

export function verifyMercadoPagoWebhookSignature(
  input: MercadoPagoWebhookSignatureInput,
): MercadoPagoWebhookSignatureResult {
  const signature = input.signature?.trim() || null;
  const requestId = input.requestId?.trim() || null;
  const dataId = input.dataId?.trim() || null;
  const secret = input.secret.trim();
  if (!signature) return { valid: false, reasonCode: "missing_signature" };
  if (!requestId) return { valid: false, reasonCode: "missing_request_id" };
  if (!dataId) return { valid: false, reasonCode: "missing_data_id" };
  if (!secret) return { valid: false, reasonCode: "missing_secret" };

  const parsed = parseSignature(signature);
  if (!parsed.timestamp && parsed.hashes.size === 0) return { valid: false, reasonCode: "malformed_signature" };
  if (!parsed.timestamp) return { valid: false, reasonCode: "missing_timestamp" };
  if (!/^\d+$/.test(parsed.timestamp)) return { valid: false, reasonCode: "malformed_signature" };
  const hash = parsed.hashes.get("v1");
  if (!hash) return { valid: false, reasonCode: "missing_hash" };

  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${parsed.timestamp};`;
  const expected = Buffer.from(createHmac("sha256", secret).update(manifest).digest("hex"));
  const received = Buffer.from(hash);
  if (received.length === expected.length && timingSafeEqual(received, expected)) return { valid: true };

  // Exact-case compatibility is limited to test Orders; production uses lowercase.
  if (/^ORDTST[A-Z0-9]+$/.test(dataId)) {
    const exactManifest = `id:${dataId};request-id:${requestId};ts:${parsed.timestamp};`;
    const exactExpected = Buffer.from(createHmac("sha256", secret).update(exactManifest).digest("hex"));
    if (received.length === exactExpected.length && timingSafeEqual(received, exactExpected)) {
      return { valid: true, sandboxExactCase: true };
    }
  }
  return { valid: false, reasonCode: "signature_mismatch" };
}

function parseSignature(value: string): Readonly<{ timestamp: string | null; hashes: Map<string, string> }> {
  let timestamp: string | null = null;
  const hashes = new Map<string, string>();
  for (const entry of value.split(",")) {
    const separator = entry.indexOf("=");
    if (separator === -1) continue;
    const key = entry.slice(0, separator).trim().toLowerCase();
    const item = entry.slice(separator + 1).trim();
    if (!key || !item) continue;
    if (key === "ts") timestamp = item;
    else if (/^v\d+$/.test(key)) hashes.set(key, item);
  }
  return { timestamp, hashes };
}
