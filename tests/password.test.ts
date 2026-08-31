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
});
