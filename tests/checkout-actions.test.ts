import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  getCurrentCustomer: vi.fn(),
  getGuestCartToken: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/modules/customers/presentation/customer-session", () => ({ getCurrentCustomer: mocks.getCurrentCustomer }));
vi.mock("@/modules/cart/presentation/guest-cart-cookie", () => ({
  deleteGuestCartCookie: vi.fn(),
  getGuestCartToken: mocks.getGuestCartToken,
}));
vi.mock("@/shared/infrastructure/rate-limit", () => ({ assertRateLimit: vi.fn() }));
vi.mock("@/modules/orders/infrastructure/order-composition", () => ({
  getCheckoutService: () => ({ confirm: mocks.confirm }),
}));
vi.mock("@/modules/orders/presentation/guest-order-cookie", () => ({ setGuestOrderCookie: vi.fn() }));

import { confirmCheckoutAction } from "@/modules/orders/presentation/checkout-actions";
import { initialCheckoutActionState } from "@/modules/orders/presentation/checkout-action-state";

const shippingMethodId = "10000000-0000-4000-8000-000000000007";
const checkoutKey = "A".repeat(43);

describe("confirmCheckoutAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentCustomer.mockResolvedValue(null);
  });

  it("asocia el teléfono invitado vacío al campo y preserva los datos normales", async () => {
    const result = await confirmCheckoutAction(initialCheckoutActionState, form({ phone: "" }));

    expect(result.fieldErrors?.phone).toBe("El teléfono es obligatorio.");
    expect(result.values).toMatchObject({
      shippingMethodId,
      firstName: "Ana",
      lastName: "Pérez",
      email: "ana@example.com",
      phone: "",
      addressMode: "new",
      street: "San Martín",
      streetNumber: "1234",
      floorApartment: "2 B",
      city: "CABA",
      province: "Buenos Aires",
      postalCode: "1000",
      references: "Portón negro",
    });
    expect(result.values).not.toHaveProperty("checkoutKey");
  });

  it("asocia un email invitado inválido al campo email", async () => {
    const result = await confirmCheckoutAction(initialCheckoutActionState, form({ email: "no-es-email" }));

    expect(result.fieldErrors?.email).toBe("Ingresá un email válido.");
    expect(result.values?.email).toBe("no-es-email");
  });

  it("ignora datos de comprador enviados por cliente para una sesión autenticada", async () => {
    mocks.getCurrentCustomer.mockResolvedValue({ id: "10000000-0000-4000-8000-000000000002" });
    mocks.headers.mockResolvedValue(new Headers());
    mocks.confirm.mockResolvedValue({ order: { number: 10001n }, reused: false });
    mocks.redirect.mockImplementation(() => { throw new Error("NEXT_REDIRECT"); });

    await expect(confirmCheckoutAction(initialCheckoutActionState, form({
      firstName: "Manipulado",
      lastName: "Desde cliente",
      email: "atacante@example.com",
      phone: "+54 11 0000-0000",
      addressMode: "saved",
      savedAddressId: "10000000-0000-4000-8000-000000000008",
    }))).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.confirm).toHaveBeenCalledOnce();
    expect(mocks.confirm.mock.calls[0]?.[0]).toMatchObject({
      owner: { kind: "customer", customerId: "10000000-0000-4000-8000-000000000002" },
      checkoutKey,
      shippingMethodId,
    });
    expect(mocks.confirm.mock.calls[0]?.[0]).not.toHaveProperty("guestBuyer");
  });
});

function form(overrides: Record<string, string> = {}) {
  const values = {
    checkoutKey,
    shippingMethodId,
    firstName: "Ana",
    lastName: "Pérez",
    email: "ana@example.com",
    phone: "+54 11 5555-0000",
    addressMode: "new",
    savedAddressId: "",
    recipientFirstName: "Ana",
    recipientLastName: "Pérez",
    shippingPhone: "+54 11 5555-0000",
    street: "San Martín",
    streetNumber: "1234",
    floorApartment: "2 B",
    city: "CABA",
    province: "Buenos Aires",
    postalCode: "1000",
    references: "Portón negro",
    ...overrides,
  };
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}
