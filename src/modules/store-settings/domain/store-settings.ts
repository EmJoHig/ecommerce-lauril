import { z } from "zod";
import { ValidationError } from "@/shared/domain/errors";

export type StoreSettings = Readonly<{
  storeName: string;
  publicEmail: string;
  phone: string | null;
  whatsapp: string | null;
  businessAddress: string | null;
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
    instagramUrl: socialUrl(input.instagramUrl, "Instagram"),
    facebookUrl: socialUrl(input.facebookUrl, "Facebook"),
    publicDescription: optionalText(input.publicDescription, 500, "La descripción pública"),
  };
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
