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
