import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { ConflictError } from "@/shared/domain/errors";
import type {
  CustomerAddressRecord,
  CustomerRecord,
  CustomerRepository,
  CustomerSessionRecord,
  PasswordResetRecord,
} from "../application/customer-repository";
import type { CustomerAddressInput } from "../domain/customer";

const customerInclude = { user: true } satisfies Prisma.CustomerInclude;
type CustomerRow = Prisma.CustomerGetPayload<{ include: typeof customerInclude }>;

export class PrismaCustomerRepository implements CustomerRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(email: string): Promise<CustomerRecord | null> {
    const customer = await this.prisma.customer.findFirst({
      where: { user: { email } },
      include: customerInclude,
    });
    return customer ? mapCustomer(customer) : null;
  }

  async createCustomerWithSession(input: Parameters<CustomerRepository["createCustomerWithSession"]>[0]): Promise<CustomerRecord> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: input.email,
            passwordHash: input.passwordHash,
            firstName: input.firstName,
            lastName: input.lastName,
            status: "ACTIVE",
          },
        });
        const customer = await tx.customer.create({
          data: {
            userId: user.id,
            phone: input.phone,
            document: input.document,
          },
          include: customerInclude,
        });
        await tx.session.create({
          data: {
            userId: user.id,
            tokenHash: input.session.tokenHash,
            expiresAt: input.session.expiresAt,
            ipAddress: input.session.ipAddress,
            userAgent: input.session.userAgent,
          },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: user.id,
            action: "customer.register",
            entityType: "Customer",
            entityId: customer.id,
            ipAddress: input.session.ipAddress,
          },
        });
        return mapCustomer(customer);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }

  async createSession(userId: string, session: Parameters<CustomerRepository["createSession"]>[1]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.session.create({
        data: {
          userId,
          tokenHash: session.tokenHash,
          expiresAt: session.expiresAt,
          ipAddress: session.ipAddress,
          userAgent: session.userAgent,
        },
      }),
      this.prisma.user.update({ where: { id: userId }, data: { lastLoginAt: session.occurredAt } }),
      this.prisma.auditLog.create({
        data: {
          actorUserId: userId,
          action: "customer.login",
          entityType: "User",
          entityId: userId,
          ipAddress: session.ipAddress,
        },
      }),
    ]);
  }

  async findSessionByTokenHash(tokenHash: string): Promise<CustomerSessionRecord | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: { user: { include: { customer: true } } },
    });
    if (!session?.user.customer) return null;
    return {
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
      customer: mapCustomer({ ...session.user.customer, user: session.user }),
    };
  }

  async revokeSession(tokenHash: string, revokedAt: Date): Promise<void> {
    await this.prisma.session.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt },
    });
  }

  async createPasswordReset(input: Parameters<CustomerRepository["createPasswordReset"]>[0]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({
        where: { userId: input.userId, usedAt: null },
        data: { usedAt: input.occurredAt },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          userId: input.userId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          actorUserId: input.userId,
          action: "customer.password_reset_requested",
          entityType: "User",
          entityId: input.userId,
          ipAddress: input.ipAddress,
        },
      }),
    ]);
  }

  async findPasswordReset(tokenHash: string): Promise<PasswordResetRecord | null> {
    const token = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { customer: { select: { id: true } } } } },
    });
    if (!token?.user.customer) return null;
    return {
      userId: token.userId,
      customerId: token.user.customer.id,
      expiresAt: token.expiresAt,
      usedAt: token.usedAt,
    };
  }

  async consumePasswordReset(input: Parameters<CustomerRepository["consumePasswordReset"]>[0]): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const token = await tx.passwordResetToken.findUnique({
        where: { tokenHash: input.tokenHash },
        select: { id: true, userId: true, usedAt: true, expiresAt: true },
      });
      if (!token || token.usedAt || token.expiresAt <= input.occurredAt) return false;
      const consumed = await tx.passwordResetToken.updateMany({
        where: { id: token.id, usedAt: null, expiresAt: { gt: input.occurredAt } },
        data: { usedAt: input.occurredAt },
      });
      if (consumed.count !== 1) return false;
      await tx.user.update({
        where: { id: token.userId },
        data: { passwordHash: input.passwordHash },
      });
      await tx.session.updateMany({
        where: { userId: token.userId, revokedAt: null },
        data: { revokedAt: input.occurredAt },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: token.userId,
          action: "customer.password_reset_completed",
          entityType: "User",
          entityId: token.userId,
          ipAddress: input.ipAddress,
        },
      });
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async findById(customerId: string): Promise<CustomerRecord | null> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: customerInclude,
    });
    return customer ? mapCustomer(customer) : null;
  }

  async updateProfile(input: Parameters<CustomerRepository["updateProfile"]>[0]): Promise<CustomerRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.customer.findUnique({
        where: { id: input.customerId },
        select: { userId: true },
      });
      if (!current) return null;
      await tx.user.update({
        where: { id: current.userId },
        data: { firstName: input.firstName, lastName: input.lastName },
      });
      const customer = await tx.customer.update({
        where: { id: input.customerId },
        data: { phone: input.phone, document: input.document },
        include: customerInclude,
      });
      await tx.auditLog.create({
        data: {
          actorUserId: current.userId,
          action: "customer.profile_updated",
          entityType: "Customer",
          entityId: input.customerId,
        },
      });
      return mapCustomer(customer);
    });
  }

  async listAddresses(customerId: string): Promise<ReadonlyArray<CustomerAddressRecord>> {
    return this.prisma.customerAddress.findMany({
      where: { customerId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
  }

  async createAddress(customerId: string, input: CustomerAddressInput): Promise<CustomerAddressRecord> {
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUniqueOrThrow({
        where: { id: customerId },
        select: { userId: true },
      });
      const count = await tx.customerAddress.count({ where: { customerId } });
      const makeDefault = input.isDefault === true || count === 0;
      if (makeDefault) {
        await tx.customerAddress.updateMany({ where: { customerId }, data: { isDefault: false } });
      }
      const address = await tx.customerAddress.create({
        data: { ...input, isDefault: makeDefault, customerId },
      });
      await auditAddress(tx, customer.userId, "customer.address_created", address.id);
      return address;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async updateAddress(customerId: string, addressId: string, input: CustomerAddressInput): Promise<CustomerAddressRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.customerAddress.findFirst({ where: { id: addressId, customerId } });
      if (!current) return null;
      const customer = await tx.customer.findUniqueOrThrow({ where: { id: customerId }, select: { userId: true } });
      const makeDefault = input.isDefault === true || current.isDefault;
      if (makeDefault) {
        await tx.customerAddress.updateMany({ where: { customerId, id: { not: addressId } }, data: { isDefault: false } });
      }
      const address = await tx.customerAddress.update({
        where: { id: addressId },
        data: { ...input, isDefault: makeDefault },
      });
      await auditAddress(tx, customer.userId, "customer.address_updated", address.id);
      return address;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async deleteAddress(customerId: string, addressId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.customerAddress.findFirst({ where: { id: addressId, customerId } });
      if (!current) return false;
      const customer = await tx.customer.findUniqueOrThrow({ where: { id: customerId }, select: { userId: true } });
      await tx.customerAddress.delete({ where: { id: addressId } });
      if (current.isDefault) {
        const replacement = await tx.customerAddress.findFirst({ where: { customerId }, orderBy: { createdAt: "asc" } });
        if (replacement) await tx.customerAddress.update({ where: { id: replacement.id }, data: { isDefault: true } });
      }
      await auditAddress(tx, customer.userId, "customer.address_deleted", addressId);
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async setDefaultAddress(customerId: string, addressId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const address = await tx.customerAddress.findFirst({ where: { id: addressId, customerId } });
      if (!address) return false;
      const customer = await tx.customer.findUniqueOrThrow({ where: { id: customerId }, select: { userId: true } });
      await tx.customerAddress.updateMany({ where: { customerId, id: { not: addressId } }, data: { isDefault: false } });
      await tx.customerAddress.update({ where: { id: addressId }, data: { isDefault: true } });
      await auditAddress(tx, customer.userId, "customer.address_defaulted", addressId);
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}

function mapCustomer(row: CustomerRow): CustomerRecord {
  return {
    id: row.id,
    userId: row.userId,
    email: row.user.email,
    passwordHash: row.user.passwordHash,
    firstName: row.user.firstName,
    lastName: row.user.lastName,
    phone: row.phone,
    document: row.document,
    status: row.status,
    userStatus: row.user.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

type Transaction = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

function auditAddress(tx: Transaction, userId: string, action: string, addressId: string) {
  return tx.auditLog.create({
    data: { actorUserId: userId, action, entityType: "CustomerAddress", entityId: addressId },
  });
}

function mapPersistenceError(error: unknown): Error {
  if (error instanceof Error && "code" in error && error.code === "P2002") {
    return new ConflictError("Ya existe una cuenta con esos datos.");
  }
  return error instanceof Error ? error : new Error("Error de persistencia de clientes.");
}
