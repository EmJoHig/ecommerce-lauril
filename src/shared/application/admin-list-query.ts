import { ValidationError } from "@/shared/domain/errors";

export function positivePage(value: number | undefined, fallback = 1): number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0 ? value! : fallback;
}

export function boundedPageSize(value: number | undefined, fallback = 20, maximum = 100): number {
  return Math.min(positivePage(value, fallback), maximum);
}

export function normalizedSearch(value: string | undefined, maximum = 200): string | undefined {
  const normalized = value?.trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, maximum) : undefined;
}

export function businessDate(value: string | undefined, endExclusive = false): Date | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ValidationError("La fecha no es válida.");
  const date = new Date(`${value}T00:00:00-03:00`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ValidationError("La fecha no es válida.");
  }
  if (endExclusive) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}
