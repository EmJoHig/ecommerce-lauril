import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/modules/auth/domain/password";
import { ValidationError } from "@/shared/domain/errors";

describe("password security", () => {
  it("hashea y verifica sin guardar el texto original", async () => {
    const password = "Una-clave-larga-2026";
    const hash = await hashPassword(password, 10);
    expect(hash).not.toContain(password);
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
    await expect(verifyPassword("otra-clave-larga", hash)).resolves.toBe(false);
  });

  it("rechaza contraseñas cortas", async () => {
    await expect(hashPassword("corta", 10)).rejects.toBeInstanceOf(ValidationError);
  });

  it("rechaza entradas que bcrypt truncaría después de 72 bytes", async () => {
    const tooLongInUtf8 = "á".repeat(37);
    await expect(hashPassword(tooLongInUtf8, 10)).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      verifyPassword(tooLongInUtf8, "$2b$10$invalid.invalid.invalid.invalid.invalid.invalid.invalid"),
    ).resolves.toBe(false);
  });

  it("valida el costo criptográfico", async () => {
    await expect(hashPassword("Una-clave-segura", 9)).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(hashPassword("Una-clave-segura", 12.5)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
