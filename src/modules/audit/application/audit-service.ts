import { businessDate, boundedPageSize, normalizedSearch, positivePage } from "@/shared/application/admin-list-query";
import type { AuditRepository } from "./audit-repository";

const sensitiveKey = /(password|token|cookie|secret|authorization|credential|session)/i;

export class AuditService {
  constructor(private readonly repository: AuditRepository) {}

  async list(input: Readonly<{
    page?: number; pageSize?: number; search?: string; action?: string; entityType?: string;
    createdFrom?: string; createdTo?: string;
  }>) {
    const search = normalizedSearch(input.search);
    const action = normalizedSearch(input.action, 120);
    const entityType = normalizedSearch(input.entityType, 100);
    const createdFrom = businessDate(input.createdFrom);
    const createdToExclusive = businessDate(input.createdTo, true);
    const result = await this.repository.list({
      page: positivePage(input.page), pageSize: boundedPageSize(input.pageSize),
      ...(search ? { search } : {}), ...(action ? { action } : {}), ...(entityType ? { entityType } : {}),
      ...(createdFrom ? { createdFrom } : {}), ...(createdToExclusive ? { createdToExclusive } : {}),
    });
    return { ...result, items: result.items.map((item) => ({ ...item, metadata: sanitizeAuditMetadata(item.metadata) })) };
  }

  listFacets() { return this.repository.listFacets(); }
}

export function sanitizeAuditMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeAuditMetadata);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).flatMap(([key, nested]) =>
      sensitiveKey.test(key) ? [] : [[key, sanitizeAuditMetadata(nested)]],
    ));
  }
  return value;
}
