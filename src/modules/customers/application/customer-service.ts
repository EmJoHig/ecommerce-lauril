import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from "@/shared/domain/errors";
import { hashPassword, validatePassword, verifyPassword } from "@/modules/auth/domain/password";
import { createSessionToken, hashSessionToken } from "@/modules/auth/domain/session-token";
import {
  normalizeCustomerAddress,
  normalizeCustomerProfile,
  normalizeEmail,
  type CustomerAddressInput,
  type CustomerProfileInput,
} from "../domain/customer";
import type { CustomerRepository, CustomerRecord } from "./customer-repository";
import type { EmailSender } from "./email-sender";

const DUMMY_PASSWORD_HASH =
  "$2b$12$3BwY68uXPaW4QioumAcX9es7JqrIYSWYXjJicejALkmQxOplUHvB6";

export type CustomerSession = Readonly<{
  token: string;
  expiresAt: Date;
  customer: CustomerView;
}>;

export type CustomerView = Omit<CustomerRecord, "passwordHash" | "userStatus">;

export type RequestContext = Readonly<{
  ipAddress: string | null;
  userAgent: string | null;
}>;

export class CustomerService {
  constructor(
    private readonly repository: CustomerRepository,
    private readonly emailSender: EmailSender,
    private readonly bcryptCost = 12,
    private readonly sessionTtlDays = 30,
    private readonly resetTtlMinutes = 30,
  ) {}

  async register(input: CustomerProfileInput & {
    email: string;
    password: string;
    passwordConfirmation: string;
  }, context: RequestContext, now = new Date()): Promise<CustomerSession> {
    const email = normalizeEmail(input.email);
    const profile = normalizeCustomerProfile(input);
    if (input.password !== input.passwordConfirmation) {
      throw new ValidationError("Las contraseñas no coinciden.");
    }
    validatePassword(input.password);
    const token = createSessionToken();
    const expiresAt = addDays(now, this.sessionTtlDays);
    try {
      const customer = await this.repository.createCustomerWithSession({
        email,
        passwordHash: await hashPassword(input.password, this.bcryptCost),
        ...profile,
        session: sessionInput(token, expiresAt, context, now),
      });
      return { token, expiresAt, customer: toView(customer) };
    } catch (error) {
      if (error instanceof ConflictError) {
        throw new ConflictError(
          "No pudimos crear la cuenta con esos datos. Si ya tenés una cuenta, ingresá.",
        );
      }
      throw error;
    }
  }

  async login(input: { email: string; password: string }, context: RequestContext, now = new Date()): Promise<CustomerSession> {
    const email = normalizeEmail(input.email);
    const customer = await this.repository.findByEmail(email);
    const matches = await verifyPassword(input.password, customer?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!customer || !matches || customer.status !== "ACTIVE" || customer.userStatus !== "ACTIVE") {
      throw new UnauthorizedError("Email o contraseña incorrectos.");
    }
    const token = createSessionToken();
    const expiresAt = addDays(now, this.sessionTtlDays);
    await this.repository.createSession(
      customer.userId,
      sessionInput(token, expiresAt, context, now),
    );
    return { token, expiresAt, customer: toView(customer) };
  }

  async findSession(token: string, now = new Date()): Promise<CustomerView | null> {
    const session = await this.repository.findSessionByTokenHash(hashSessionToken(token));
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.customer.status !== "ACTIVE" ||
      session.customer.userStatus !== "ACTIVE"
    ) return null;
    return toView(session.customer);
  }

  logout(token: string, now = new Date()): Promise<void> {
    return this.repository.revokeSession(hashSessionToken(token), now);
  }

  async requestPasswordReset(
    emailInput: string,
    context: RequestContext,
    now = new Date(),
  ): Promise<{ developmentPreviewUrl: string | null }> {
    const email = normalizeEmail(emailInput);
    const customer = await this.repository.findByEmail(email);
    if (!customer || customer.status !== "ACTIVE" || customer.userStatus !== "ACTIVE") {
      return { developmentPreviewUrl: null };
    }
    const token = createSessionToken();
    const expiresAt = addMinutes(now, this.resetTtlMinutes);
    await this.repository.createPasswordReset({
      userId: customer.userId,
      tokenHash: hashSessionToken(token),
      expiresAt,
      occurredAt: now,
      ipAddress: context.ipAddress,
    });
    return this.emailSender.sendPasswordReset({
      recipientEmail: customer.email,
      recipientName: customer.firstName,
      token,
      expiresAt,
    });
  }

  async resetPassword(
    input: { token: string; password: string; passwordConfirmation: string },
    ipAddress: string | null,
    now = new Date(),
  ): Promise<void> {
    if (input.password !== input.passwordConfirmation) {
      throw new ValidationError("Las contraseñas no coinciden.");
    }
    validatePassword(input.password);
    const record = await this.repository.findPasswordReset(hashSessionToken(input.token));
    if (!record || record.usedAt || record.expiresAt <= now) {
      throw new ValidationError("El enlace es inválido, venció o ya fue utilizado.");
    }
    const consumed = await this.repository.consumePasswordReset({
      tokenHash: hashSessionToken(input.token),
      passwordHash: await hashPassword(input.password, this.bcryptCost),
      occurredAt: now,
      ipAddress,
    });
    if (!consumed) throw new ValidationError("El enlace es inválido, venció o ya fue utilizado.");
  }

  async getProfile(customerId: string): Promise<CustomerView> {
    const customer = await this.repository.findById(customerId);
    if (!customer) throw new NotFoundError("No se encontró la cuenta.");
    return toView(customer);
  }

  async updateProfile(customerId: string, input: CustomerProfileInput): Promise<CustomerView> {
    const profile = normalizeCustomerProfile(input);
    const customer = await this.repository.updateProfile({ customerId, ...profile, occurredAt: new Date() });
    if (!customer) throw new NotFoundError("No se encontró la cuenta.");
    return toView(customer);
  }

  listAddresses(customerId: string) {
    return this.repository.listAddresses(customerId);
  }

  createAddress(customerId: string, input: CustomerAddressInput) {
    return this.repository.createAddress(customerId, normalizeCustomerAddress(input));
  }

  async updateAddress(customerId: string, addressId: string, input: CustomerAddressInput) {
    const address = await this.repository.updateAddress(
      customerId,
      addressId,
      normalizeCustomerAddress(input),
    );
    if (!address) throw new NotFoundError("No se encontró la dirección.");
    return address;
  }

  async deleteAddress(customerId: string, addressId: string): Promise<void> {
    if (!(await this.repository.deleteAddress(customerId, addressId))) {
      throw new NotFoundError("No se encontró la dirección.");
    }
  }

  async setDefaultAddress(customerId: string, addressId: string): Promise<void> {
    if (!(await this.repository.setDefaultAddress(customerId, addressId))) {
      throw new NotFoundError("No se encontró la dirección.");
    }
  }
}

function toView(customer: CustomerRecord): CustomerView {
  const { passwordHash: _passwordHash, userStatus: _userStatus, ...view } = customer;
  void _passwordHash;
  void _userStatus;
  return view;
}

function sessionInput(token: string, expiresAt: Date, context: RequestContext, occurredAt: Date) {
  return {
    tokenHash: hashSessionToken(token),
    expiresAt,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    occurredAt,
  };
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}
