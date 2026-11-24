import { it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), list: vi.fn(), find: vi.fn() }));
vi.mock("@/modules/auth/presentation/session", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/modules/withdrawal/infrastructure/withdrawal-admin-composition", () => ({ getWithdrawalAdminService: () => ({ list: mocks.list, find: mocks.find }) }));
import List from "@/app/(admin)/admin/arrepentimientos/page";
import Detail from "@/app/(admin)/admin/arrepentimientos/[id]/page";
beforeEach(() => vi.clearAllMocks());
it("bloquea listado y detalle directos sin permiso antes de consultar datos", async () => {
  mocks.requireAdmin.mockRejectedValue(new Error("denied"));
  await expect(List({ searchParams: Promise.resolve({}) })).rejects.toThrow("denied");
  await expect(Detail({ params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440000" }) })).rejects.toThrow("denied");
  expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.find).not.toHaveBeenCalled();
});
it("exige admin.access y withdrawals.read al listar", async () => {
  mocks.requireAdmin.mockResolvedValue({ permissions: [] });
  mocks.list.mockResolvedValue({ items: [], total: 0, pending: 0, inProgress: 0 });
  await List({ searchParams: Promise.resolve({ estado: "PENDING", buscar: "123" }) });
  expect(mocks.requireAdmin.mock.calls.map(([value]) => value)).toEqual(["admin.access", "withdrawals.read"]);
  expect(mocks.list).toHaveBeenCalledWith({ search: "123", status: "PENDING", page: 1 });
});
