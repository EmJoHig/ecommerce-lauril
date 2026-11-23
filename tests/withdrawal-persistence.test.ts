import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), create: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/shared/infrastructure/prisma", () => ({
  getPrisma: () => ({ withdrawalRequest: { findUnique: mocks.findUnique, create: mocks.create } }),
}));

import { getRecordWithdrawalRequest } from "@/modules/withdrawal/infrastructure/withdrawal-composition";

const input = {
  requestKey: "10000000-0000-4000-8000-000000000001",
  orderNumber: "12345",
  name: "Ana Pérez",
  email: "ana@example.com",
  website: "",
};

describe("registro idempotente de arrepentimiento", () => {
  beforeEach(() => vi.clearAllMocks());

  it("crea una sola solicitud y devuelve el mismo código al repetir la clave", async () => {
    let stored: { code: string; createdAt: Date; orderNumber: bigint; name: string; email: string } | null = null;
    mocks.findUnique.mockImplementation(async () => stored);
    mocks.create.mockImplementation(async ({ data }) => {
      stored = { ...data, createdAt: new Date("2026-11-19T00:00:00Z") };
      return stored;
    });
    const service = getRecordWithdrawalRequest();
    const first = await service.execute(input);
    const second = await service.execute(input);
    expect(second).toEqual(first);
    expect(mocks.create).toHaveBeenCalledOnce();
  });

  it("persiste sin número de pedido y conserva la idempotencia", async () => {
    let stored: { code: string; createdAt: Date; orderNumber: bigint | null; name: string; email: string } | null = null;
    mocks.findUnique.mockImplementation(async () => stored);
    mocks.create.mockImplementation(async ({ data }) => {
      stored = { ...data, createdAt: new Date("2026-11-19T00:00:00Z") };
      return stored;
    });
    const service = getRecordWithdrawalRequest();
    const withoutOrder = { ...input, orderNumber: null };
    const first = await service.execute(withoutOrder);
    expect(await service.execute(withoutOrder)).toEqual(first);
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ orderNumber: null }),
    }));
  });

  it("no atribuye una constancia previa a otros datos", async () => {
    mocks.findUnique.mockResolvedValue({
      code: "ARR-EXISTING", createdAt: new Date(), orderNumber: 12345n,
      name: "Otra persona", email: "otra@example.com",
    });
    await expect(getRecordWithdrawalRequest().execute(input)).rejects.toThrow("clave de solicitud");
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
