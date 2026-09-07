import { describe, expect, it } from "vitest";
import { StoreSettingsService } from "@/modules/store-settings/application/store-settings-service";
import type { StoreSettingsRepository } from "@/modules/store-settings/application/store-settings-repository";
import type { StoreSettings } from "@/modules/store-settings/domain/store-settings";

const actorUserId = "00000000-0000-4000-8000-000000000001";

function setup() {
  let settings: StoreSettings = {
    storeName: "Lauril",
    publicEmail: "hola@lauril.com.ar",
    phone: null,
    whatsapp: null,
    businessAddress: "Buenos Aires, Argentina",
    instagramUrl: null,
    facebookUrl: null,
    publicDescription: "Objetos elegidos para acompañar tus rituales cotidianos.",
  };
  const repository: StoreSettingsRepository = {
    get: async () => settings,
    update: async (next) => { settings = next; return settings; },
  };
  return new StoreSettingsService(repository);
}

describe("StoreSettingsService", () => {
  it("normaliza y actualiza la configuración comercial", async () => {
    const updated = await setup().update({
      storeName: "  Lauril Hogar  ",
      publicEmail: " VENTAS@LAURIL.COM.AR ",
      phone: "+54 11 4444-5555",
      whatsapp: "+54 9 11 4444-5555",
      businessAddress: "  Palermo, Buenos Aires ",
      instagramUrl: "https://instagram.com/lauril",
      facebookUrl: "",
      publicDescription: "  Objetos para todos los días. ",
    }, actorUserId);

    expect(updated).toEqual({
      storeName: "Lauril Hogar",
      publicEmail: "ventas@lauril.com.ar",
      phone: "+54 11 4444-5555",
      whatsapp: "+54 9 11 4444-5555",
      businessAddress: "Palermo, Buenos Aires",
      instagramUrl: "https://instagram.com/lauril",
      facebookUrl: null,
      publicDescription: "Objetos para todos los días.",
    });
  });

  it("rechaza email, contacto y redes inválidos", async () => {
    const service = setup();
    const base = {
      storeName: "Lauril",
      publicEmail: "hola@lauril.com.ar",
      phone: "",
      whatsapp: "",
      businessAddress: "",
      instagramUrl: "",
      facebookUrl: "",
      publicDescription: "",
    };
    expect(() => service.update({ ...base, publicEmail: "email-invalido" }, actorUserId)).toThrow("email público");
    expect(() => service.update({ ...base, phone: "abc" }, actorUserId)).toThrow("teléfono");
    expect(() => service.update({ ...base, instagramUrl: "instagram.com/lauril" }, actorUserId)).toThrow("Instagram");
  });
});
