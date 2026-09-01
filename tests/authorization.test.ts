import { describe, expect, it } from "vitest";
import { assertPermission } from "@/modules/auth/application/authorization";
import { ForbiddenError } from "@/shared/domain/errors";

describe("administrative permissions", () => {
  it("permite la capacidad explícita", () => {
    expect(() => assertPermission(["catalog.read", "catalog.write"], "catalog.write")).not.toThrow();
  });

  it("rechaza una operación aunque el usuario tenga acceso general al panel", () => {
    expect(() => assertPermission(["admin.access", "catalog.read"], "catalog.write")).toThrow(ForbiddenError);
  });
});
