import { z } from "zod";
import { positivePage, normalizedSearch } from "@/shared/application/admin-list-query";
import { validateWithdrawalChange, withdrawalStatus, type WithdrawalStatus } from "../domain/withdrawal-admin";
import { NotFoundError, ConflictError } from "@/shared/domain/errors";

export type WithdrawalSummary = { id: string; code: string; orderNumber: bigint | null; createdAt: Date; status: WithdrawalStatus; version: number };
export type WithdrawalDetail = WithdrawalSummary & { name: string; email: string; resolution: string | null; resolvedAt: Date | null; activities: Array<{ id: string; content: string; actorName: string; createdAt: Date; toStatus: WithdrawalStatus }> };
export interface WithdrawalAdminRepository {
  list(query: { page: number; search: string; status?: WithdrawalStatus }): Promise<{ items: WithdrawalSummary[]; total: number; pending: number; inProgress: number }>;
  find(id: string): Promise<WithdrawalDetail | null>;
  change(input: { id: string; version: number; from: WithdrawalStatus; to: WithdrawalStatus; content: string; actorUserId: string; now: Date }): Promise<void>;
}

export class WithdrawalAdminService {
  constructor(private readonly repository: WithdrawalAdminRepository) {}
  list(input: { page?: number; search?: string; status?: string }) {
    const status = input.status ? withdrawalStatus(input.status) : undefined;
    return this.repository.list({ page: positivePage(input.page), search: normalizedSearch(input.search, 100) ?? "", ...(status ? { status } : {}) });
  }
  async find(id: string) {
    const result = await this.repository.find(z.uuid().parse(id));
    if (!result) throw new NotFoundError("No se encontró la solicitud.");
    return result;
  }
  async change(input: { id: string; version: number; to: string; content: string; actorUserId: string }, now = new Date()) {
    const request = await this.find(input.id);
    if (request.version !== z.number().int().min(0).parse(input.version)) throw new ConflictError("La solicitud cambió. Recargá antes de continuar.");
    const to = withdrawalStatus(input.to);
    const content = validateWithdrawalChange(request.status, to, input.content);
    await this.repository.change({ id: request.id, version: request.version, from: request.status, to, content, actorUserId: z.uuid().parse(input.actorUserId), now });
  }
}
