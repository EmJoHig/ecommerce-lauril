import { z } from "zod";
import { ValidationError } from "@/shared/domain/errors";

export type StoreSettings = Readonly<{
  storeName: string;
  publicEmail: string;
  phone: string | null;
  whatsapp: string | null;
  businessAddress: string | null;
  sellerName: string | null;
  sellerCuit: string | null;
  sellerFiscalAddress: string | null;
  fiscalDataUrl: string | null;
  fiscalDataLogoUrl: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  publicDescription: string | null;
}>;

export type StoreSettingsInput = Readonly<Record<keyof StoreSettings, string>>;

export function validateStoreSettings(input: StoreSettingsInput): StoreSettings {
  const storeName = requiredText(input.storeName, "El nombre comercial", 120);
  const publicEmail = input.publicEmail.trim().toLowerCase();
  if (!z.email().safeParse(publicEmail).success || publicEmail.length > 320) {
    throw new ValidationError("Ingresá un email público válido.");
  }

  return {
    storeName,
    publicEmail,
    phone: contactNumber(input.phone, "El teléfono"),
    whatsapp: contactNumber(input.whatsapp, "El WhatsApp"),
    businessAddress: optionalText(input.businessAddress, 300, "La dirección comercial"),
    sellerName: optionalText(input.sellerName, 160, "El nombre del titular fiscal"),
    sellerCuit: optionalCuit(input.sellerCuit),
    sellerFiscalAddress: optionalText(input.sellerFiscalAddress, 300, "El domicilio fiscal"),
    fiscalDataUrl: optionalHttpsUrl(input.fiscalDataUrl, "Formulario 960/D"),
    fiscalDataLogoUrl: optionalHttpsUrl(input.fiscalDataLogoUrl, "logo del Formulario 960/D"),
    instagramUrl: socialUrl(input.instagramUrl, "Instagram"),
    facebookUrl: socialUrl(input.facebookUrl, "Facebook"),
    publicDescription: optionalText(input.publicDescription, 500, "La descripción pública"),
  };
}

function optionalCuit(value: string): string | null {
  const normalized = value.replace(/[\s-]/g, "");
  if (!normalized) return null;
  if (!/^[0-9]{11}$/.test(normalized)) throw new ValidationError("El CUIT debe tener 11 dígitos.");
  return normalized;
}

function optionalHttpsUrl(value: string, label: string): string | null {
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > 500 || !/^https:\/\//i.test(normalized) || !z.url().safeParse(normalized).success) {
    throw new ValidationError(`La URL de ${label} debe ser HTTPS.`);
  }
  const hostname = new URL(normalized).hostname.toLowerCase();
  if (!["arca.gob.ar", "afip.gob.ar"].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
    throw new ValidationError(`La URL de ${label} debe pertenecer a ARCA.`);
  }
  return normalized;
}

function requiredText(value: string, label: string, maximum: number): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > maximum) {
    throw new ValidationError(`${label} es obligatorio y admite hasta ${maximum} caracteres.`);
  }
  return normalized;
}

function optionalText(value: string, maximum: number, label: string): string | null {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length > maximum) throw new ValidationError(`${label} admite hasta ${maximum} caracteres.`);
  return normalized || null;
}

function contactNumber(value: string, label: string): string | null {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  if (normalized.length > 30 || !/^\+?[0-9][0-9 ()-]{5,29}$/.test(normalized)) {
    throw new ValidationError(`${label} no tiene un formato válido.`);
  }
  return normalized;
}

function socialUrl(value: string, label: string): string | null {
  const normalized = value.trim();
  if (!normalized) return null;
  const parsed = z.url().safeParse(normalized);
  if (!parsed.success || normalized.length > 500 || !/^https?:\/\//i.test(normalized)) {
    throw new ValidationError(`La URL de ${label} no es válida.`);
  }
  return normalized;
}
