import { ValidationError } from "@/shared/domain/errors";

export const withdrawalStatuses = ["PENDING", "IN_PROGRESS", "RESOLVED"] as const;
export type WithdrawalStatus = typeof withdrawalStatuses[number];
export const withdrawalLabels: Record<WithdrawalStatus, string> = { PENDING: "Pendiente", IN_PROGRESS: "En gestión", RESOLVED: "Resuelta" };

export function withdrawalStatus(value: string | null): WithdrawalStatus {
  if (value === null) return "PENDING";
  if (!withdrawalStatuses.includes(value as WithdrawalStatus)) throw new ValidationError("Estado de solicitud inválido.");
  return value as WithdrawalStatus;
}

export function validateWithdrawalChange(from: WithdrawalStatus, to: WithdrawalStatus, content: string): string {
  // Actuaciones en el mismo estado, apertura de gestión y cierre; no se reabren resueltas.
  if (from === "RESOLVED" || (from === "IN_PROGRESS" && to === "PENDING")) throw new ValidationError("La transición no está permitida.");
  const normalized = content.trim();
  if (!normalized || normalized.length > 2000) throw new ValidationError("Registrá una actuación o resolución de hasta 2000 caracteres.");
  return normalized;
}

export function withdrawalAge(received: Date, now = new Date()): string {
  const hours = Math.max(0, Math.floor((now.getTime() - received.getTime()) / 3600000));
  return `${Math.floor(hours / 24)} días y ${hours % 24} horas`;
}
