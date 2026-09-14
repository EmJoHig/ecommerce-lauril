import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resolveRequestIp } from "@/shared/infrastructure/request-ip";

describe("resolveRequestIp", () => {
  it("usa el hop más cercano al único Nginx y no el primer valor arbitrario", () => {
    expect(resolveRequestIp(new Headers({
      "x-forwarded-for": "198.51.100.99, 203.0.113.10",
    }))).toBe("203.0.113.10");
    expect(resolveRequestIp(new Headers())).toBeNull();
    expect(resolveRequestIp(new Headers({ "x-forwarded-for": "valor-invalido" }))).toBeNull();
  });
});
