import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/modules/store-settings/infrastructure/store-settings-composition", () => ({
  getPublicStoreSettings: async () => ({
    storeName: "Lauril",
    publicEmail: "hola@example.com",
    phone: null,
    whatsapp: null,
    businessAddress: null,
    sellerName: null,
    sellerCuit: null,
    sellerFiscalAddress: null,
    fiscalDataUrl: null,
    fiscalDataLogoUrl: null,
    instagramUrl: null,
    facebookUrl: null,
    publicDescription: null,
  }),
}));
vi.mock("@/modules/shipping/infrastructure/shipping-composition", () => ({
  getPublicShippingMethods: async () => [{ id: "method-1", name: "Entrega local", description: "Zona configurada" }],
}));

import CommercialInformationPage from "@/app/(store)/informacion-comercial/page";
import TermsPage from "@/app/(store)/terminos-y-condiciones/page";
import PrivacyPage from "@/app/(store)/politica-de-privacidad/page";
import ReturnsPage from "@/app/(store)/cambios-y-devoluciones/page";
import ShippingInformationPage from "@/app/(store)/envios-y-entregas/page";

describe("páginas informativas B1", () => {
  it("renderiza títulos, enlaces y contacto configurado sin datos fiscales ficticios", async () => {
    const pages = await Promise.all([
      CommercialInformationPage(), TermsPage(), PrivacyPage(), ReturnsPage(), ShippingInformationPage(),
    ]);
    const html = pages.map((page) => renderToStaticMarkup(page)).join("\n");
    for (const title of ["Información comercial", "Términos y condiciones", "Política de privacidad", "Cambios y devoluciones", "Envíos y entregas"]) {
      expect(html).toContain(title);
    }
    expect(html).toContain("mailto:hola@example.com");
    expect(html).toContain('href="/arrepentimiento"');
    expect(html).toContain("Entrega local");
    expect(html).toContain("La Plata (ARS 2.500)");
    expect(html).toContain("Berisso (ARS 3.500)");
    expect(html).toContain("hasta 2 días hábiles");
    expect(html).toContain("hasta 1 día hábil adicional");
    expect(html).toContain("domingos y feriados");
    expect(html).not.toContain("48 horas hábiles");
    expect(html).not.toContain("24 horas hábiles");
    expect(html).toContain("factura electrónica C");
    expect(html).toContain("15 días corridos");
    expect(html).not.toMatch(/CUIT:|PENDIENTE/);
    expect(html).toContain("Tecnoclean — Punto de retiro Lauril");
  });
});
