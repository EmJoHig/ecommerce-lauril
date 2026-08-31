import { getPrisma } from "@/shared/infrastructure/prisma";
import { AuthService } from "../application/auth-service";

export function getAuthService(): AuthService {
  return new AuthService(getPrisma());
}
