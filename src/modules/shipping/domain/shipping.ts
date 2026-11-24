import { z } from "zod";
import { ValidationError } from "@/shared/domain/errors";
import { money } from "@/shared/domain/money";

export const shippingMethodTypes = [
  "PICKUP",
  "FLAT_RATE",
  "LOCAL_DELIVERY",
  "TO_COORDINATE",
] as const;

export type ShippingMethodType = (typeof shippingMethodTypes)[number];

export type ShippingMethodState = Readonly<{
  id: string;
  code: string;
  name: string;
  description: string | null;
  type: ShippingMethodType;
  costInCents: bigint;
  requiresAddress: boolean;
  minimumSubtotalInCents: bigint | null;
  freeShippingFromInCents: bigint | null;
  isActive: boolean;
  sortOrder: number;
}>;

export type ShippingMethodDraft = Omit<ShippingMethodState, "id">;

export type ShippingQuote = Readonly<{
  methodId: string;
  code: string;
  name: string;
  description: string | null;
  type: ShippingMethodType;
  amountInCents: bigint;
  requiresAddress: boolean;
}>;

export function normalizeShippingCode(value: string): string {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,79}$/.test(code)) {
    throw new ValidationError("El código admite letras, números, guion y guion bajo.");
  }
  return code;
}

export function validateShippingMethod(state: ShippingMethodState): ShippingMethodState {
  z.uuid().parse(state.id);
  return { id: state.id, ...validateShippingMethodDraft(state) };
}

export function validateShippingMethodDraft(state: ShippingMethodDraft): ShippingMethodDraft {
  const name = state.name.trim().replace(/\s+/g, " ");
  const description = state.description?.trim().replace(/\s+/g, " ") || null;
  if (!name || name.length > 120) throw new ValidationError("El nombre del método es obligatorio.");
  if (description && description.length > 500) throw new ValidationError("La descripción admite hasta 500 caracteres.");
  money(state.costInCents);
  if (state.minimumSubtotalInCents !== null) money(state.minimumSubtotalInCents);
  if (state.freeShippingFromInCents !== null) money(state.freeShippingFromInCents);
  if (!Number.isSafeInteger(state.sortOrder) || state.sortOrder < 0) {
    throw new ValidationError("El orden debe ser un entero no negativo.");
  }
  assertAddressPolicy(state.type, state.requiresAddress);
  return { ...state, code: normalizeShippingCode(state.code), name, description };
}

export function quoteShippingMethod(
  stateInput: ShippingMethodState,
  itemsSubtotalInCents: bigint,
): ShippingQuote | null {
  const state = validateShippingMethod(stateInput);
  money(itemsSubtotalInCents);
  if (!state.isActive) return null;
  if (state.minimumSubtotalInCents !== null && itemsSubtotalInCents < state.minimumSubtotalInCents) {
    return null;
  }
  const isFree = state.freeShippingFromInCents !== null
    && itemsSubtotalInCents >= state.freeShippingFromInCents;
  return {
    methodId: state.id,
    code: state.code,
    name: state.name,
    description: state.description,
    type: state.type,
    amountInCents: isFree ? 0n : state.costInCents,
    requiresAddress: state.requiresAddress,
  };
}

const laurilMethods = {
  RETIRO_LOCAL: { type: "PICKUP", costInCents: 0n, requiresAddress: false },
  ENVIO_LA_PLATA: { type: "LOCAL_DELIVERY", costInCents: 250000n, requiresAddress: true },
  ENVIO_BERISSO: { type: "LOCAL_DELIVERY", costInCents: 350000n, requiresAddress: true },
} as const;

export function isLaurilShippingMethod(method: ShippingMethodState): boolean {
  const expected = laurilMethods[method.code as keyof typeof laurilMethods];
  return Boolean(expected && method.isActive && method.type === expected.type
    && method.costInCents === expected.costInCents
    && method.requiresAddress === expected.requiresAddress
    && method.minimumSubtotalInCents === null
    && method.freeShippingFromInCents === null);
}

export function assertLaurilShippingAddress(
  code: string,
  address: Readonly<{ city: string; province: string }> | null,
): void {
  if (code === "RETIRO_LOCAL") return;
  const expectedCity = code === "ENVIO_LA_PLATA" ? "la plata" : "berisso";
  const normalizedCity = address ? normalizeLocation(address.city) : "";
  const normalizedProvince = address ? normalizeLocation(address.province) : "";
  if (normalizedCity !== expectedCity || normalizedProvince !== "buenos aires") {
    throw new ValidationError("La modalidad de entrega no corresponde a la localidad y provincia indicadas.");
  }
}

function normalizeLocation(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function assertAddressPolicy(type: ShippingMethodType, requiresAddress: boolean): void {
  if (type === "PICKUP" && requiresAddress) {
    throw new ValidationError("El retiro en local no requiere dirección.");
  }
  if (type === "LOCAL_DELIVERY" && !requiresAddress) {
    throw new ValidationError("El envío local requiere dirección.");
  }
  if (type === "TO_COORDINATE" && requiresAddress) {
    throw new ValidationError("El envío a coordinar se define después y no solicita dirección ahora.");
  }
}
