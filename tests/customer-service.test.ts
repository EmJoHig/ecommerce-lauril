import { describe, expect, it } from "vitest";
import { hashSessionToken } from "@/modules/auth/domain/session-token";
import type {
  CustomerAddressRecord,
  CustomerRecord,
  CustomerRepository,
  CustomerSessionRecord,
  PasswordResetRecord,
} from "@/modules/customers/application/customer-repository";
import { CustomerService } from "@/modules/customers/application/customer-service";
import type { EmailSender } from "@/modules/customers/application/email-sender";
import type { CustomerAddressInput } from "@/modules/customers/domain/customer";
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from "@/shared/domain/errors";

const now = new Date("2026-09-01T12:00:00.000Z");
const context = { ipAddress: "127.0.0.1", userAgent: "vitest" };

describe("customer registration and authentication", () => {
  it("registra, normaliza email, hashea la contraseña y crea sesión", async () => {
    const repository = new MemoryCustomerRepository();
    const service = createService(repository);
    const session = await service.register(registration(), context, now);
    expect(session.customer.email).toBe("cliente@lauril.test");
    expect(repository.customers[0]?.passwordHash).not.toContain("Clave-segura");
    expect(repository.sessions.has(hashSessionToken(session.token))).toBe(true);
    expect(await service.findSession(session.token, now)).toMatchObject({ email: "cliente@lauril.test" });
  });

  it("rechaza email duplicado con un mensaje seguro", async () => {
    const repository = new MemoryCustomerRepository();
    const service = createService(repository);
    await service.register(registration(), context, now);
    await expect(service.register(registration(), context, now)).rejects.toBeInstanceOf(ConflictError);
  });

  it("rechaza contraseña inválida o confirmación diferente", async () => {
    const service = createService(new MemoryCustomerRepository());
    await expect(service.register(registration({ password: "corta", passwordConfirmation: "corta" }), context, now)).rejects.toBeInstanceOf(ValidationError);
    await expect(service.register(registration({ passwordConfirmation: "Otra-clave-segura" }), context, now)).rejects.toThrow("no coinciden");
  });

  it("inicia sesión, mantiene mensaje genérico y revoca en logout", async () => {
    const repository = new MemoryCustomerRepository();
    const service = createService(repository);
    await service.register(registration(), context, now);
    const session = await service.login({ email: " CLIENTE@LAURIL.TEST ", password: "Clave-segura-123" }, context, now);
    expect(await service.findSession(session.token, now)).not.toBeNull();
    await expect(service.login({ email: "cliente@lauril.test", password: "incorrecta" }, context, now)).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(service.login({ email: "nadie@lauril.test", password: "incorrecta" }, context, now)).rejects.toThrow("Email o contraseña incorrectos");
    await service.logout(session.token, now);
    expect(await service.findSession(session.token, now)).toBeNull();
  });

  it("no autentica como cliente una identidad administrativa sin Customer", async () => {
    const service = createService(new MemoryCustomerRepository());
    await expect(service.login({ email: "admin@lauril.test", password: "Clave-segura-123" }, context, now)).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe("customer password recovery", () => {
  it("crea token impredecible, guarda solo hash y permite un único uso", async () => {
    const repository = new MemoryCustomerRepository();
    const sender = new MemoryEmailSender();
    const service = createService(repository, sender);
    await service.register(registration(), context, now);
    const delivery = await service.requestPasswordReset("cliente@lauril.test", context, now);
    expect(delivery.developmentPreviewUrl).toContain("#token=");
    expect(sender.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(repository.resets.has(hashSessionToken(sender.token!))).toBe(true);
    expect(repository.resets.has(sender.token!)).toBe(false);
    await service.resetPassword({ token: sender.token!, password: "Nueva-clave-456", passwordConfirmation: "Nueva-clave-456" }, null, now);
    await expect(service.resetPassword({ token: sender.token!, password: "Otra-clave-789", passwordConfirmation: "Otra-clave-789" }, null, now)).rejects.toThrow("ya fue utilizado");
    await expect(service.login({ email: "cliente@lauril.test", password: "Nueva-clave-456" }, context, now)).resolves.toBeDefined();
  });

  it("rechaza token vencido y no revela si el email existe", async () => {
    const repository = new MemoryCustomerRepository();
    const sender = new MemoryEmailSender();
    const service = createService(repository, sender);
    await service.register(registration(), context, now);
    await service.requestPasswordReset("cliente@lauril.test", context, now);
    await expect(service.resetPassword({ token: sender.token!, password: "Nueva-clave-456", passwordConfirmation: "Nueva-clave-456" }, null, new Date("2026-09-01T13:00:00Z"))).rejects.toThrow("venció");
    await expect(service.requestPasswordReset("ausente@lauril.test", context, now)).resolves.toEqual({ developmentPreviewUrl: null });
  });
});

describe("customer profile and address ownership", () => {
  it("actualiza perfil sin permitir cambiar el email", async () => {
    const repository = new MemoryCustomerRepository();
    const service = createService(repository);
    const session = await service.register(registration(), context, now);
    const profile = await service.updateProfile(session.customer.id, { firstName: "Ana", lastName: "Pérez", phone: "+54 11 5555-1234", document: "30111222" });
    expect(profile).toMatchObject({ email: "cliente@lauril.test", firstName: "Ana", document: "30111222" });
  });

  it("crea, edita, selecciona predeterminada y elimina direcciones", async () => {
    const repository = new MemoryCustomerRepository();
    const service = createService(repository);
    const customer = (await service.register(registration(), context, now)).customer;
    const home = await service.createAddress(customer.id, address({ label: "Casa" }));
    const work = await service.createAddress(customer.id, address({ label: "Trabajo" }));
    expect(home.isDefault).toBe(true);
    await service.setDefaultAddress(customer.id, work.id);
    expect((await service.listAddresses(customer.id)).find(({ id }) => id === work.id)?.isDefault).toBe(true);
    const edited = await service.updateAddress(customer.id, work.id, address({ label: "Oficina", isDefault: true }));
    expect(edited.label).toBe("Oficina");
    await service.deleteAddress(customer.id, work.id);
    expect(await service.listAddresses(customer.id)).toHaveLength(1);
    expect((await service.listAddresses(customer.id))[0]?.isDefault).toBe(true);
  });

  it("impide leer o mutar direcciones de otro cliente", async () => {
    const repository = new MemoryCustomerRepository();
    const service = createService(repository);
    const first = (await service.register(registration(), context, now)).customer;
    const second = (await service.register(registration({ email: "otro@lauril.test" }), context, now)).customer;
    const saved = await service.createAddress(first.id, address({ label: "Casa" }));
    expect(await service.listAddresses(second.id)).toEqual([]);
    await expect(service.updateAddress(second.id, saved.id, address())).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.deleteAddress(second.id, saved.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.setDefaultAddress(second.id, saved.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

function registration(overrides: Partial<ReturnType<typeof registrationBase>> = {}) {
  return { ...registrationBase(), ...overrides };
}

function registrationBase() {
  return { firstName: "María", lastName: "Cliente", email: " CLIENTE@LAURIL.TEST ", phone: "+54 11 4444-5555", document: "", password: "Clave-segura-123", passwordConfirmation: "Clave-segura-123" };
}

function address(overrides: Partial<CustomerAddressInput> = {}): CustomerAddressInput {
  return { label: "Casa", recipientFirstName: "María", recipientLastName: "Cliente", phone: "+54 11 4444-5555", street: "Calle Falsa", streetNumber: "123", city: "Buenos Aires", province: "Buenos Aires", postalCode: "C1000", isDefault: false, ...overrides };
}

function createService(repository: MemoryCustomerRepository, sender = new MemoryEmailSender()) {
  return new CustomerService(repository, sender, 10, 30, 30);
}

class MemoryEmailSender implements EmailSender {
  token: string | null = null;
  sendPasswordReset(input: Parameters<EmailSender["sendPasswordReset"]>[0]) {
    this.token = input.token;
    return Promise.resolve({ developmentPreviewUrl: `http://localhost/restablecer-clave#token=${input.token}` });
  }
}

class MemoryCustomerRepository implements CustomerRepository {
  customers: CustomerRecord[] = [];
  sessions = new Map<string, CustomerSessionRecord>();
  resets = new Map<string, PasswordResetRecord>();
  addresses: CustomerAddressRecord[] = [];
  private sequence = 0;

  findByEmail(email: string) { return Promise.resolve(this.customers.find((item) => item.email === email) ?? null); }
  async createCustomerWithSession(input: Parameters<CustomerRepository["createCustomerWithSession"]>[0]) {
    if (this.customers.some((item) => item.email === input.email)) throw new ConflictError("duplicate");
    const customer: CustomerRecord = { id: crypto.randomUUID(), userId: crypto.randomUUID(), email: input.email, passwordHash: input.passwordHash, firstName: input.firstName, lastName: input.lastName, phone: input.phone, document: input.document, status: "ACTIVE", userStatus: "ACTIVE", createdAt: input.session.occurredAt, updatedAt: input.session.occurredAt };
    this.customers.push(customer);
    this.sessions.set(input.session.tokenHash, { expiresAt: input.session.expiresAt, revokedAt: null, customer });
    return customer;
  }
  createSession(userId: string, session: Parameters<CustomerRepository["createSession"]>[1]) {
    const customer = this.customers.find((item) => item.userId === userId)!;
    this.sessions.set(session.tokenHash, { expiresAt: session.expiresAt, revokedAt: null, customer });
    return Promise.resolve();
  }
  findSessionByTokenHash(hash: string) { return Promise.resolve(this.sessions.get(hash) ?? null); }
  revokeSession(hash: string, revokedAt: Date) { const session = this.sessions.get(hash); if (session) this.sessions.set(hash, { ...session, revokedAt }); return Promise.resolve(); }
  createPasswordReset(input: Parameters<CustomerRepository["createPasswordReset"]>[0]) { this.resets.set(input.tokenHash, { userId: input.userId, customerId: this.customers.find((item) => item.userId === input.userId)!.id, expiresAt: input.expiresAt, usedAt: null }); return Promise.resolve(); }
  findPasswordReset(hash: string) { return Promise.resolve(this.resets.get(hash) ?? null); }
  async consumePasswordReset(input: Parameters<CustomerRepository["consumePasswordReset"]>[0]) { const reset = this.resets.get(input.tokenHash); if (!reset || reset.usedAt || reset.expiresAt <= input.occurredAt) return false; this.resets.set(input.tokenHash, { ...reset, usedAt: input.occurredAt }); const index = this.customers.findIndex((item) => item.userId === reset.userId); this.customers[index] = { ...this.customers[index]!, passwordHash: input.passwordHash }; for (const [hash, session] of this.sessions) if (session.customer.userId === reset.userId) this.sessions.set(hash, { ...session, revokedAt: input.occurredAt }); return true; }
  findById(id: string) { return Promise.resolve(this.customers.find((item) => item.id === id) ?? null); }
  async updateProfile(input: Parameters<CustomerRepository["updateProfile"]>[0]) { const index = this.customers.findIndex((item) => item.id === input.customerId); if (index < 0) return null; this.customers[index] = { ...this.customers[index]!, firstName: input.firstName, lastName: input.lastName, phone: input.phone, document: input.document, updatedAt: input.occurredAt }; return this.customers[index]!; }
  listAddresses(customerId: string) { return Promise.resolve(this.addresses.filter((item) => item.customerId === customerId).sort((a,b) => Number(b.isDefault)-Number(a.isDefault))); }
  createAddress(customerId: string, input: CustomerAddressInput) { const makeDefault = input.isDefault === true || !this.addresses.some((item) => item.customerId === customerId); if (makeDefault) this.addresses = this.addresses.map((item) => item.customerId === customerId ? { ...item, isDefault: false } : item); const saved = this.addressRecord(customerId, input, makeDefault); this.addresses.push(saved); return Promise.resolve(saved); }
  updateAddress(customerId: string, addressId: string, input: CustomerAddressInput) { const index = this.addresses.findIndex((item) => item.id === addressId && item.customerId === customerId); if (index < 0) return Promise.resolve(null); const makeDefault = input.isDefault === true || this.addresses[index]!.isDefault; if (makeDefault) this.addresses = this.addresses.map((item) => item.customerId === customerId ? { ...item, isDefault: false } : item); const updated = { ...this.addresses[index]!, ...input, floorApartment: input.floorApartment ?? null, references: input.references ?? null, isDefault: makeDefault, updatedAt: now }; this.addresses[index] = updated; return Promise.resolve(updated); }
  deleteAddress(customerId: string, addressId: string) { const index = this.addresses.findIndex((item) => item.id === addressId && item.customerId === customerId); if (index < 0) return Promise.resolve(false); const wasDefault = this.addresses[index]!.isDefault; this.addresses.splice(index,1); if (wasDefault) { const replacement = this.addresses.find((item) => item.customerId === customerId); if (replacement) this.addresses = this.addresses.map((item) => item.id === replacement.id ? { ...item, isDefault: true } : item); } return Promise.resolve(true); }
  setDefaultAddress(customerId: string, addressId: string) { const selected = this.addresses.find((item) => item.id === addressId && item.customerId === customerId); if (!selected) return Promise.resolve(false); this.addresses = this.addresses.map((item) => item.customerId === customerId ? { ...item, isDefault: item.id === addressId } : item); return Promise.resolve(true); }
  private addressRecord(customerId: string, input: CustomerAddressInput, isDefault: boolean): CustomerAddressRecord { return { id: `00000000-0000-4000-8000-${String(++this.sequence).padStart(12,"0")}`, customerId, label: input.label, recipientFirstName: input.recipientFirstName, recipientLastName: input.recipientLastName, phone: input.phone, street: input.street, streetNumber: input.streetNumber, floorApartment: input.floorApartment ?? null, city: input.city, province: input.province, postalCode: input.postalCode, references: input.references ?? null, isDefault, createdAt: now, updatedAt: now }; }
}
