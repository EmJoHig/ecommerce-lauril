import "server-only";
import { getPrisma } from "@/shared/infrastructure/prisma";
import { getServerEnv } from "@/shared/infrastructure/env";
import { AdminAccessService } from "../application/admin-access-service";
import { PrismaAdminAccessRepository } from "./prisma-admin-access-repository";

export function getAdminAccessService(): AdminAccessService {
  return new AdminAccessService(new PrismaAdminAccessRepository(getPrisma()), getServerEnv().BCRYPT_COST);
}
