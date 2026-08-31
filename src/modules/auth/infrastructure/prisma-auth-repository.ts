import type { PrismaClient } from "@/generated/prisma/client";
import type {
  AuthRepository,
  AuthSessionRecord,
  AuthUserRecord,
} from "../application/auth-repository";

const userWithPermissions = {
  roles: {
    include: {
      role: {
        include: {
          permissions: { include: { permission: true } },
        },
      },
    },
  },
} as const;

type PrismaAuthUser = Awaited<
  ReturnType<PrismaClient["user"]["findUnique"]>
>;

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: userWithPermissions,
    });
    return user ? mapUser(user) : null;
  }

  async createLoginSession(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    ipAddress: string | null;
    userAgent: string | null;
    occurredAt: Date;
  }): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.session.create({
        data: {
          userId: input.userId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
        },
      }),
      this.prisma.user.update({
        where: { id: input.userId },
        data: { lastLoginAt: input.occurredAt },
      }),
      this.prisma.auditLog.create({
        data: {
          actorUserId: input.userId,
          action: "auth.login",
          entityType: "User",
          entityId: input.userId,
          ipAddress: input.ipAddress,
        },
      }),
    ]);
  }

  async findSessionByTokenHash(
    tokenHash: string,
  ): Promise<AuthSessionRecord | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: { user: { include: userWithPermissions } },
    });
    if (!session) return null;

    return {
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
      user: mapUser(session.user),
    };
  }

  async revokeSession(tokenHash: string, revokedAt: Date): Promise<void> {
    await this.prisma.session.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt },
    });
  }
}

function mapUser(user: NonNullable<PrismaAuthUser> & {
  roles: Array<{
    role: { permissions: Array<{ permission: { code: string } }> };
  }>;
}): AuthUserRecord {
  return {
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    firstName: user.firstName,
    lastName: user.lastName,
    status: user.status,
    permissions: user.roles.flatMap(({ role }) =>
      role.permissions.map(({ permission }) => permission.code),
    ),
  };
}
