import { describe, it, expect, vi, beforeEach } from "vitest";
import { WithdrawalAdminService, type WithdrawalAdminRepository } from "@/modules/withdrawal/application/withdrawal-admin-service";
import { validateWithdrawalChange, withdrawalAge, withdrawalStatus } from "@/modules/withdrawal/domain/withdrawal-admin";

const auth = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
const change = vi.hoisted(() => vi.fn());
vi.mock("@/modules/auth/presentation/session", () => auth);
vi.mock("@/modules/withdrawal/infrastructure/withdrawal-admin-composition", () => ({ getWithdrawalAdminService: () => ({ change }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { manageWithdrawal } from "@/modules/withdrawal/presentation/withdrawal-admin-actions";

const id = "550e8400-e29b-41d4-a716-446655440000";
describe("gestión administrativa de arrepentimientos", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("interpreta recepción antigua y antigüedad calendario incluyendo domingo", () => {
    expect(withdrawalStatus(null)).toBe("PENDING");
    expect(withdrawalAge(new Date("2026-11-21T12:00Z"), new Date("2026-11-23T13:00Z"))).toBe("2 días y 1 horas");
  });
  it("permite actuaciones, gestión y cierre; prohíbe reabrir y retroceder", () => {
    for (const [from, to] of [["PENDING", "PENDING"], ["PENDING", "IN_PROGRESS"], ["PENDING", "RESOLVED"], ["IN_PROGRESS", "RESOLVED"]] as const) expect(validateWithdrawalChange(from, to, " Contactado ")).toBe("Contactado");
    expect(() => validateWithdrawalChange("RESOLVED", "IN_PROGRESS", "x")).toThrow();
    expect(() => validateWithdrawalChange("IN_PROGRESS", "PENDING", "x")).toThrow();
    expect(() => validateWithdrawalChange("PENDING", "RESOLVED", " ")).toThrow();
  });
  it("normaliza filtros y rechaza modificación con versión desactualizada", async () => {
    const repository = { list: vi.fn(), find: vi.fn().mockResolvedValue({ id, status: "PENDING", version: 2 }), change: vi.fn() } as unknown as WithdrawalAdminRepository;
    const service = new WithdrawalAdminService(repository);
    service.list({ page: -1, search: " ARR-TEST ", status: "PENDING" });
    expect(repository.list).toHaveBeenCalledWith({ page: 1, search: "ARR-TEST", status: "PENDING" });
    await expect(service.change({ id, version: 1, to: "RESOLVED", content: "Resuelta", actorUserId: id })).rejects.toThrow("cambió");
    expect(repository.change).not.toHaveBeenCalled();
  });
  it("rechaza acción directa sin autorización antes de modificar", async () => {
    auth.requireAdmin.mockRejectedValue(new Error("denied"));
    await expect(manageWithdrawal({ message: "", success: false }, new FormData())).rejects.toThrow("denied");
    expect(change).not.toHaveBeenCalled();
  });
  it("valida ambos permisos y toma operador de sesión sin confiar en cliente", async () => {
    auth.requireAdmin.mockResolvedValue({ id, permissions: [] });
    change.mockResolvedValue(undefined);
    const data = new FormData();
    for (const [key, value] of Object.entries({ id, version: "0", status: "IN_PROGRESS", content: "Contacto inicial", actorUserId: "attacker" })) data.set(key, value);
    expect((await manageWithdrawal({ message: "", success: false }, data)).success).toBe(true);
    expect(auth.requireAdmin.mock.calls.map(([permission]) => permission)).toEqual(["admin.access", "withdrawals.write", "withdrawals.read"]);
    expect(change).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: id }));
  });
  it("rechaza escritura directa de una cuenta con acceso pero sin withdrawals.write", async () => {
    auth.requireAdmin.mockImplementation(async (permission) => {
      if (permission === "withdrawals.write") throw new Error("denied write");
      return { id, permissions: ["admin.access", "withdrawals.read"] };
    });
    await expect(manageWithdrawal({ message: "", success: false }, new FormData())).rejects.toThrow("denied write");
    expect(change).not.toHaveBeenCalled();
  });
});
