import bcrypt from "bcryptjs";
import { ValidationError } from "@/shared/domain/errors";

export async function hashPassword(
  password: string,
  cost = 12,
): Promise<string> {
  validatePassword(password);
  return bcrypt.hash(password, cost);
}

export function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function validatePassword(password: string): void {
  if (password.length < 12 || password.length > 128) {
    throw new ValidationError(
      "La contraseña debe tener entre 12 y 128 caracteres.",
    );
  }
}
