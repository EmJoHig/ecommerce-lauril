import type { PrismaClient } from "@/generated/prisma/client";
import { UnauthorizedError } from "@/shared/domain/errors";
import { verifyPassword } from "../domain/password";
import { createSessionToken, hashSessionToken } from "../domain/session-token";

const DUMMY_PASSWORD_HASH =
  "$2b$12$3BwY68uXPaW4QioumAcX9es7JqrIYSWYXjJicejALkmQxOplUHvB6";

export type AuthenticatedSession = Readonly<{
  token: string;
  expiresAt: Date;
  user: {
    id: string;
    email: string;
    name: string;
    permissions: string[];
  };
}>;

export class AuthService {
  constructor(private readonly prisma: PrismaClient) {}

  async login(input: {
    email: string;
    password: string;
    ipAddress: string | null;
    userAgent: string | null;
    ttlDays: number;
  }): Promise<AuthenticatedSession> {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });

    const matches = await verifyPassword(
      input.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!user || !matches || user.status !== "ACTIVE") {
      throw new UnauthorizedError("Email o contraseña incorrectos.");
    }

    const permissions = [
      ...new Set(
        user.roles.flatMap(({ role }) =>
          role.permissions.map(({ permission }) => permission.code),
        ),
      ),
    ];
    if (!permissions.includes("admin.access")) {
      throw new UnauthorizedError("La cuenta no posee acceso administrativo.");
    }

    const token = createSessionToken();
    const expiresAt = new Date(
      Date.now() + input.ttlDays * 24 * 60 * 60 * 1000,
    );
    await this.prisma.$transaction([
      this.prisma.session.create({
        data: {
          userId: user.id,
          tokenHash: hashSessionToken(token),
          expiresAt,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
        },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }),
      this.prisma.auditLog.create({
        data: {
          actorUserId: user.id,
          action: "auth.login",
          entityType: "User",
          entityId: user.id,
          ipAddress: input.ipAddress,
        },
      }),
    ]);

    return {
      token,
      expiresAt,
      user: {
        id: user.id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`.trim(),
        permissions,
      },
    };
  }

  async findSession(token: string): Promise<AuthenticatedSession["user"] | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: {
        user: {
          include: {
            roles: {
              include: {
                role: {
                  include: {
                    permissions: { include: { permission: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== "ACTIVE"
    ) {
      return null;
    }

    return {
      id: session.user.id,
      email: session.user.email,
      name: `${session.user.firstName} ${session.user.lastName}`.trim(),
      permissions: [
        ...new Set(
          session.user.roles.flatMap(({ role }) =>
            role.permissions.map(({ permission }) => permission.code),
          ),
        ),
      ],
    };
  }

  async logout(token: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { tokenHash: hashSessionToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
