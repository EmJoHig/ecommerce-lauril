import { describe, expect, it } from "vitest";
import type {
  AuthRepository,
  AuthSessionRecord,
  AuthUserRecord,
} from "@/modules/auth/application/auth-repository";
import { AuthService } from "@/modules/auth/application/auth-service";
import { hashPassword } from "@/modules/auth/domain/password";
import { hashSessionToken } from "@/modules/auth/domain/session-token";
import { UnauthorizedError } from "@/shared/domain/errors";

class InMemoryAuthRepository implements AuthRepository {
  session: AuthSessionRecord | null = null;
  createdTokenHash: string | null = null;

  constructor(private readonly user: AuthUserRecord | null) {}

  findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    return Promise.resolve(this.user?.email === email ? this.user : null);
  }

  createLoginSession(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    this.createdTokenHash = input.tokenHash;
    if (this.user) {
      this.session = {
        expiresAt: input.expiresAt,
        revokedAt: null,
        user: this.user,
      };
    }
    return Promise.resolve();
  }

  findSessionByTokenHash(tokenHash: string): Promise<AuthSessionRecord | null> {
    return Promise.resolve(
      tokenHash === this.createdTokenHash ? this.session : null,
    );
  }

  revokeSession(tokenHash: string, revokedAt: Date): Promise<void> {
    if (tokenHash === this.createdTokenHash && this.session) {
      this.session = { ...this.session, revokedAt };
    }
    return Promise.resolve();
  }
}

describe("AuthService", () => {
  it("autentica mediante el puerto, almacena solo el hash y revoca la sesión", async () => {
    const repository = new InMemoryAuthRepository({
      id: "admin-1",
      email: "admin@lauril.test",
      passwordHash: await hashPassword("Una-clave-segura", 10),
      firstName: "Admin",
      lastName: "Lauril",
      status: "ACTIVE",
      permissions: ["admin.access", "admin.access", "catalog.read"],
    });
    const service = new AuthService(repository);

    const session = await service.login({
      email: " ADMIN@LAURIL.TEST ",
      password: "Una-clave-segura",
      ipAddress: null,
      userAgent: null,
      ttlDays: 1,
    });

    expect(repository.createdTokenHash).toBe(hashSessionToken(session.token));
    expect(repository.createdTokenHash).not.toBe(session.token);
    expect(session.user.permissions).toEqual(["admin.access", "catalog.read"]);
    await expect(service.findSession(session.token)).resolves.toEqual(session.user);

    await service.logout(session.token);
    await expect(service.findSession(session.token)).resolves.toBeNull();
  });

  it("no permite una cuenta sin acceso administrativo", async () => {
    const repository = new InMemoryAuthRepository({
      id: "user-1",
      email: "user@lauril.test",
      passwordHash: await hashPassword("Una-clave-segura", 10),
      firstName: "Usuario",
      lastName: "Lauril",
      status: "ACTIVE",
      permissions: ["catalog.read"],
    });

    await expect(
      new AuthService(repository).login({
        email: "user@lauril.test",
        password: "Una-clave-segura",
        ipAddress: null,
        userAgent: null,
        ttlDays: 1,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
