import { describe, expect, it } from "vitest";
import { operationalErrorCategory } from "@/shared/infrastructure/logger";

describe("operationalErrorCategory", () => {
  it("distingue base de datos y proveedor incluso en causas anidadas", () => {
    const databaseError = new Error("mongodb+srv://secret");
    databaseError.name = "PrismaClientKnownRequestError";
    const providerError = new Error("token privado");
    providerError.name = "PaymentGatewayError";

    expect(operationalErrorCategory(databaseError)).toBe("database");
    expect(operationalErrorCategory(new Error("webhook", { cause: providerError }))).toBe("payment_provider");
  });

  it("clasifica errores desconocidos sin exponer su mensaje", () => {
    expect(operationalErrorCategory(new Error("token privado"))).toBe("application");
  });
});
