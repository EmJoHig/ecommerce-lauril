import { z } from "zod";
import { ValidationError } from "@/shared/domain/errors";

const emailSchema = z.email().max(320);

export type CustomerProfileInput = Readonly<{
  firstName: string;
  lastName: string;
  phone: string;
  document?: string | null;
}>;

export type CustomerAddressInput = Readonly<{
  label: string;
  recipientFirstName: string;
  recipientLastName: string;
  phone: string;
  street: string;
  streetNumber: string;
  floorApartment?: string | null;
  city: string;
  province: string;
  postalCode: string;
  references?: string | null;
  isDefault?: boolean;
}>;

export function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!emailSchema.safeParse(email).success) {
    throw new ValidationError("Ingresá un email válido.");
  }
  return email;
}

export function normalizeCustomerProfile(input: CustomerProfileInput) {
  return {
    firstName: requiredText(input.firstName, "El nombre", 100),
    lastName: requiredText(input.lastName, "El apellido", 100),
    phone: normalizePhone(input.phone),
    document: optionalText(input.document, "El documento", 50, 5),
  };
}

export function normalizeCustomerAddress(input: CustomerAddressInput) {
  return {
    label: requiredText(input.label, "El nombre de la dirección", 80),
    recipientFirstName: requiredText(input.recipientFirstName, "El nombre del receptor", 100),
    recipientLastName: requiredText(input.recipientLastName, "El apellido del receptor", 100),
    phone: normalizePhone(input.phone),
    street: requiredText(input.street, "La calle", 160),
    streetNumber: requiredText(input.streetNumber, "El número", 30),
    floorApartment: optionalText(input.floorApartment, "El piso o departamento", 80),
    city: requiredText(input.city, "La localidad", 120),
    province: requiredText(input.province, "La provincia", 120),
    postalCode: requiredText(input.postalCode, "El código postal", 20),
    references: optionalText(input.references, "Las referencias", 500),
    isDefault: input.isDefault === true,
  };
}

function normalizePhone(value: string): string {
  const phone = value.trim();
  if (phone.length < 6 || phone.length > 30 || !/^[+()0-9 .-]+$/.test(phone)) {
    throw new ValidationError("Ingresá un teléfono válido.");
  }
  if ((phone.match(/[0-9]/g) ?? []).length < 6) {
    throw new ValidationError("Ingresá un teléfono válido.");
  }
  return phone;
}

function requiredText(value: string, label: string, maximum: number): string {
  const text = value.trim().replace(/\s+/g, " ");
  if (!text || text.length > maximum) {
    throw new ValidationError(`${label} es obligatorio y admite hasta ${maximum} caracteres.`);
  }
  return text;
}

function optionalText(
  value: string | null | undefined,
  label: string,
  maximum: number,
  minimum = 1,
): string | null {
  const text = value?.trim().replace(/\s+/g, " ") ?? "";
  if (!text) return null;
  if (text.length < minimum || text.length > maximum) {
    throw new ValidationError(`${label} debe tener entre ${minimum} y ${maximum} caracteres.`);
  }
  return text;
}
