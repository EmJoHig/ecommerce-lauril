type LogLevel = "info" | "warn" | "error";

type LogContext = Record<string, boolean | number | string | null | undefined>;

export function operationalErrorCategory(error: unknown): "database" | "payment_provider" | "application" {
  let current = error;
  for (let depth = 0; depth < 3 && current instanceof Error; depth++) {
    if (/^(Prisma|Mongo)/.test(current.name)) return "database";
    if (current.name === "PaymentGatewayError") return "payment_provider";
    current = current.cause;
  }
  return "application";
}

function write(level: LogLevel, message: string, context: LogContext = {}): void {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  });

  if (level === "error") {
    console.error(entry);
    return;
  }

  if (level === "warn") {
    console.warn(entry);
    return;
  }

  console.info(entry);
}

export const logger = {
  info: (message: string, context?: LogContext) => write("info", message, context),
  warn: (message: string, context?: LogContext) => write("warn", message, context),
  error: (message: string, context?: LogContext) =>
    write("error", message, context),
};
