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
  if (env.NODE_ENV === "test") return new CustomerEmailSender(env.APP_URL, false);

  const missing = requiredResendVariables.filter((name) => !env[name]);
  const resendConfigured = missing.length === 0;
  const resendPartiallyConfigured = missing.length < requiredResendVariables.length;
  if (env.NODE_ENV === "production" || resendPartiallyConfigured) {
    if (resendConfigured) return createResendEmailSender(env);
    throw new Error(`Configuración de email incompleta: ${missing.join(", ")}`);
  }
  if (!resendConfigured) return new CustomerEmailSender(env.APP_URL, true);

  return createResendEmailSender(env);
}

function createResendEmailSender(env: EmailSenderEnv): ResendEmailSender {
  return new ResendEmailSender({
    apiKey: env.RESEND_API_KEY!,
    from: env.EMAIL_FROM!,
    appUrl: env.APP_URL,
  });
}
