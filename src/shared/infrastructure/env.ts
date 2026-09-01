import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SESSION_COOKIE_NAME: z.string().min(1).default("lauril_session"),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  CART_COOKIE_NAME: z.string().min(1).default("lauril_cart"),
  CART_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  BCRYPT_COST: z.coerce.number().int().min(10).max(15).default(12),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join("."));
    throw new Error(
      `Configuración de entorno inválida o incompleta: ${fields.join(", ")}`,
    );
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}
