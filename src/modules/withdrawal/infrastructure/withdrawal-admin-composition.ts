import "server-only";
import { getPrisma } from "@/shared/infrastructure/prisma";
import { WithdrawalAdminService } from "../application/withdrawal-admin-service";
import { PrismaWithdrawalAdminRepository } from "./prisma-withdrawal-admin-repository";
export function getWithdrawalAdminService() { return new WithdrawalAdminService(new PrismaWithdrawalAdminRepository(getPrisma())); }
