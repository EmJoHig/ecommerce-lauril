import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/infrastructure/database-health", () => ({
  isDatabaseReachable: vi.fn(),
}));

import { GET } from "@/app/api/health/route";
import { isDatabaseReachable } from "@/shared/infrastructure/database-health";

const databaseReachabilityMock = vi.mocked(isDatabaseReachable);

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    databaseReachabilityMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("responde el health superficial sin consultar la base", async () => {
    const response = await GET(new Request("http://localhost/api/health"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: "ok", timestamp: expect.any(String) });
    expect(databaseReachabilityMock).not.toHaveBeenCalled();
  });

  it("no consulta la base para deep=1 en production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await GET(new Request("http://localhost/api/health?deep=1"));

    expect(databaseReachabilityMock).not.toHaveBeenCalled();
  });

  it("responde 404 sin detalles internos para deep=1 en production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const response = await GET(new Request("http://localhost/api/health?deep=1"));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ status: "not_found" });
  });

  it("conserva el health profundo fuera de production", async () => {
    databaseReachabilityMock.mockResolvedValue(true);

    const response = await GET(new Request("http://localhost/api/health?deep=1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: "ok",
      database: "reachable",
      timestamp: expect.any(String),
    });
    expect(databaseReachabilityMock).toHaveBeenCalledOnce();
  });

  it("ignora otros valores y parámetros sin activar el health profundo", async () => {
    const response = await GET(
      new Request("http://localhost/api/health?deep=true&details=1"),
    );

    expect(response.status).toBe(200);
    expect(databaseReachabilityMock).not.toHaveBeenCalled();
  });
});
