import bcrypt from "bcryptjs";
import { ValidationError } from "@/shared/domain/errors";

export async function hashPassword(
  password: string,
  cost = 12,
): Promise<string> {
  validatePassword(password);
  validateBcryptCost(cost);
  return bcrypt.hash(password, cost);
}

export function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  if (Buffer.byteLength(password, "utf8") > 72) {
    return Promise.resolve(false);
  }
  return bcrypt.compare(password, passwordHash);
}

export function validatePassword(password: string): void {
  if (password.length < 12) {
    throw new ValidationError(
      "La contraseña debe tener al menos 12 caracteres.",
    );
  }
  if (Buffer.byteLength(password, "utf8") > 72) {
    throw new ValidationError(
      "La contraseña no puede superar 72 bytes en UTF-8.",
    );
  }
}

function validateBcryptCost(cost: number): void {
  if (!Number.isInteger(cost) || cost < 10 || cost > 15) {
    throw new ValidationError(
      "El costo de bcrypt debe ser un entero entre 10 y 15.",
    );
  }
}
