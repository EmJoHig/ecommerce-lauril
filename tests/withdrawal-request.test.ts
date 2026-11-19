import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  assertRateLimit: vi.fn(),
  execute: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/shared/infrastructure/rate-limit", () => ({ assertRateLimit: mocks.assertRateLimit }));
vi.mock("@/shared/infrastructure/prisma", () => ({ getPrisma: () => ({ withdrawalRequest: { findUnique: mocks.findUnique, create: mocks.create } }) }));
vi.mock("@/modules/withdrawal/infrastructure/withdrawal-composition", () => ({
  getRecordWithdrawalRequest: () => ({ execute: mocks.execute }),
}));

import { submitWithdrawalRequest } from "@/app/(store)/arrepentimiento/action";
import { RecordWithdrawalRequest, withdrawalInputSchema } from "@/modules/withdrawal/application/record-withdrawal-request";

const requestKey = "10000000-0000-4000-8000-000000000001";
const initial = { status: "idle" as const, message: "" };

function form() {
  const data = new FormData();
  data.set("requestKey", requestKey);
  data.set("orderNumber", "12345");
  data.set("name", "Ana Pérez");
  data.set("email", "ana@example.com");
  data.set("website", "");
  return data;
}

describe("solicitud pública de arrepentimiento", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers({ "x-forwarded-for": "203.0.113.10" }));
    mocks.execute.mockResolvedValue({ code: "ARR-123", createdAt: new Date("2026-11-19T00:00:00Z") });
  });

  it("registra sin sesión y entrega el código inmediatamente", async () => {
    const result = await submitWithdrawalRequest(initial, form());
    expect(result.status).toBe("success");
    expect(result.code).toBe("ARR-123");
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({ orderNumber: "12345", email: "ana@example.com" }));
    expect(mocks.assertRateLimit).toHaveBeenCalledOnce();
  });

  it("rechaza datos inválidos y honeypot sin persistir", async () => {
    const data = form();
    data.set("website", "spam");
    expect((await submitWithdrawalRequest(initial, data)).status).toBe("error");
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(withdrawalInputSchema.safeParse({ requestKey, orderNumber: "0", name: "Ana", email: "ana@example.com", website: "" }).success).toBe(false);
  });

  it("no entrega una constancia si falla la persistencia", async () => {
    mocks.execute.mockRejectedValue(new Error("database unavailable"));
    const result = await submitWithdrawalRequest(initial, form());
    expect(result.status).toBe("error");
    expect(result.code).toBeUndefined();
  });

  it("genera un código y conserva los datos mínimos para el repositorio", async () => {
    const createOrFind = vi.fn().mockImplementation(async (input) => ({ code: input.code, createdAt: new Date() }));
    const service = new RecordWithdrawalRequest({ createOrFind });
    const result = await service.execute(withdrawalInputSchema.parse(Object.fromEntries(form())));
    expect(result.code).toMatch(/^ARR-[0-9A-F-]{36}$/);
    expect(createOrFind).toHaveBeenCalledWith(expect.objectContaining({ requestKey, orderNumber: "12345", name: "Ana Pérez", email: "ana@example.com" }));
  });
});
