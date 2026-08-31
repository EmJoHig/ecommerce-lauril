import { getPrisma } from "@/shared/infrastructure/prisma";
import { AuthService } from "../application/auth-service";
import { PrismaAuthRepository } from "./prisma-auth-repository";

export function getAuthService(): AuthService {
  return new AuthService(new PrismaAuthRepository(getPrisma()));
}
