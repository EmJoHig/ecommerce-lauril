import "server-only";
import { getPrisma } from "@/shared/infrastructure/prisma";
import { AdminOverviewService } from "../application/admin-overview-service";
import { PrismaAdminOverviewRepository } from "./prisma-admin-overview-repository";

export function getAdminOverviewService(): AdminOverviewService {
  return new AdminOverviewService(new PrismaAdminOverviewRepository(getPrisma()));
}
