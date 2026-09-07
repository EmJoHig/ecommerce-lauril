import "server-only";
import { getPrisma } from "@/shared/infrastructure/prisma";
import { AuditService } from "../application/audit-service";
import { PrismaAuditRepository } from "./prisma-audit-repository";

export function getAuditService(): AuditService {
  return new AuditService(new PrismaAuditRepository(getPrisma()));
}
