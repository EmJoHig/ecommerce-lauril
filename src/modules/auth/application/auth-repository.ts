export type AuthUserStatus = "ACTIVE" | "INVITED" | "DISABLED";

export type AuthUserRecord = Readonly<{
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  status: AuthUserStatus;
  permissions: string[];
}>;

export type AuthSessionRecord = Readonly<{
  expiresAt: Date;
  revokedAt: Date | null;
  user: AuthUserRecord;
}>;

export interface AuthRepository {
  findUserByEmail(email: string): Promise<AuthUserRecord | null>;
  createLoginSession(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    ipAddress: string | null;
    userAgent: string | null;
    occurredAt: Date;
  }): Promise<void>;
  findSessionByTokenHash(tokenHash: string): Promise<AuthSessionRecord | null>;
  revokeSession(tokenHash: string, revokedAt: Date): Promise<void>;
}
