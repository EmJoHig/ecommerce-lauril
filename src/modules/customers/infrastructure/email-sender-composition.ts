import type { ServerEnv } from "@/shared/infrastructure/env";
import type { EmailSender } from "../application/email-sender";
import { CustomerEmailSender } from "./customer-email-sender";
import { ResendEmailSender } from "./resend-email-sender";

type EmailSenderEnv = Pick<
  ServerEnv,
  "NODE_ENV" | "APP_URL" | "RESEND_API_KEY" | "EMAIL_FROM"
>;

const requiredResendVariables = ["RESEND_API_KEY", "EMAIL_FROM"] as const;

export function createEmailSender(env: EmailSenderEnv): EmailSender {
  if (env.NODE_ENV !== "production") {
    return new CustomerEmailSender(env.APP_URL, env.NODE_ENV === "development");
  }

  const missing = requiredResendVariables.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`Configuración de email incompleta: ${missing.join(", ")}`);
  }

  return new ResendEmailSender({
    apiKey: env.RESEND_API_KEY!,
    from: env.EMAIL_FROM!,
    appUrl: env.APP_URL,
  });
}
