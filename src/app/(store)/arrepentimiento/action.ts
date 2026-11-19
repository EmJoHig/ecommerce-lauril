"use server";

import { headers } from "next/headers";
import { getRecordWithdrawalRequest } from "@/modules/withdrawal/infrastructure/withdrawal-composition";
import { withdrawalInputSchema } from "@/modules/withdrawal/application/record-withdrawal-request";
import { assertRateLimit } from "@/shared/infrastructure/rate-limit";
import { resolveRequestIp } from "@/shared/infrastructure/request-ip";

export type WithdrawalActionState = Readonly<{ status: "idle" | "success" | "error"; message: string; code?: string }>;

export async function submitWithdrawalRequest(_: WithdrawalActionState, formData: FormData): Promise<WithdrawalActionState> {
  const parsed = withdrawalInputSchema.safeParse({
    requestKey: formData.get("requestKey"),
    orderNumber: formData.get("orderNumber"),
    name: formData.get("name"),
    email: formData.get("email"),
    website: formData.get("website"),
  });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Revisá los datos ingresados." };
  try {
    const requestHeaders = await headers();
    assertRateLimit({ scope: "withdrawal:ip", identity: resolveRequestIp(requestHeaders) ?? "unknown", limit: 10, windowMs: 60 * 60_000 });
    const recorded = await getRecordWithdrawalRequest().execute(parsed.data);
    return {
      status: "success",
      code: recorded.code,
      message: "Recibimos tu solicitud. Guardá este código; te contactaremos para verificar los datos y continuar el trámite.",
    };
  } catch {
    return { status: "error", message: "No pudimos registrar la solicitud. Intentá nuevamente o contactanos por los canales de atención." };
  }
}
