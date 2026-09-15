import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ForbiddenError } from "@/shared/domain/errors";
import { assertPermission } from "@/modules/auth/application/authorization";

const mocks = vi.hoisted(() => ({
  permissions: [] as string[],
  get: vi.fn(),
  update: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ usePathname: () => "/admin/configuracion" }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/modules/auth/presentation/session", () => ({
  requireAdmin: vi.fn(async (permission: string) => {
    assertPermission(mocks.permissions, permission);
    return { id: "a1a1a1a1-a1a1-4a1a-a1a1-a1a1a1a1a1a1", permissions: mocks.permissions };
  }),
}));
vi.mock("@/modules/store-settings/infrastructure/store-settings-composition", () => ({
  getStoreSettingsService: () => ({ get: mocks.get, update: mocks.update }),
}));
vi.mock("@/modules/store-settings/presentation/store-settings-form", () => ({
  StoreSettingsForm: ({ canWrite }: { canWrite: boolean }) => createElement("span", null, canWrite ? "editable" : "solo lectura"),
}));

import StoreSettingsPage from "@/app/(admin)/admin/configuracion/page";
import { saveStoreSettingsAction } from "@/modules/store-settings/presentation/store-settings-actions";
import { AdminNavigation } from "@/modules/admin/presentation/admin-navigation";
import { requireAdmin } from "@/modules/auth/presentation/session";

const formData = new FormData();
for (const field of ["storeName", "publicEmail", "phone", "whatsapp", "businessAddress", "instagramUrl", "facebookUrl", "publicDescription"]) {
  formData.set(field, field === "publicEmail" ? "hola@example.com" : "Lauril");
}

describe("StoreSettings RBAC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permissions = [];
    mocks.get.mockResolvedValue({ storeName: "Lauril" });
    mocks.update.mockResolvedValue(undefined);
  });

  it("settings.read abre la página en solo lectura", async () => {
    mocks.permissions = ["admin.access", "settings.read"];
    const page = await StoreSettingsPage();
    expect(renderToStaticMarkup(page)).toContain("solo lectura");
    expect(requireAdmin).toHaveBeenCalledWith("settings.read");
    expect(mocks.get).toHaveBeenCalledOnce();
  });

  it("sin settings.read, admin.access no permite cargar la configuración", async () => {
    mocks.permissions = ["admin.access", "settings.write"];
    await expect(StoreSettingsPage()).rejects.toBeInstanceOf(ForbiddenError);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("settings.write permite guardar desde la Server Action", async () => {
    mocks.permissions = ["admin.access", "settings.read", "settings.write"];
    const result = await saveStoreSettingsAction({ status: "idle", message: "" }, formData);
    expect(result.status).toBe("success");
    expect(requireAdmin).toHaveBeenCalledWith("settings.write");
    expect(mocks.update).toHaveBeenCalledOnce();
  });

  it.each([["settings.read"], ["admin.access"]])("%s sin settings.write no puede invocar la acción", async (permission) => {
    mocks.permissions = ["admin.access", permission];
    await expect(saveStoreSettingsAction({ status: "idle", message: "" }, formData)).rejects.toBeInstanceOf(ForbiddenError);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("la navegación muestra Configuración solo con settings.read", () => {
    expect(renderToStaticMarkup(createElement(AdminNavigation, { permissions: ["admin.access"] }))).not.toContain("Configuración");
    expect(renderToStaticMarkup(createElement(AdminNavigation, { permissions: ["admin.access", "settings.read"] }))).toContain("Configuración");
  });
});
