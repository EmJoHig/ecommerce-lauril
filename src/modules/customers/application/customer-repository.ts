import type { CustomerAddressInput } from "../domain/customer";

export type CustomerStatusValue = "ACTIVE" | "DISABLED";

export type CustomerRecord = Readonly<{
  id: string;
  userId: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone: string;
  document: string | null;
  status: CustomerStatusValue;
  userStatus: "ACTIVE" | "INVITED" | "DISABLED";
  createdAt: Date;
  updatedAt: Date;
}>;

export type CustomerSessionRecord = Readonly<{
  expiresAt: Date;
  revokedAt: Date | null;
  customer: CustomerRecord;
}>;

export type CustomerAddressRecord = Readonly<{
  id: string;
  customerId: string;
  label: string;
  recipientFirstName: string;
  recipientLastName: string;
  phone: string;
  street: string;
  streetNumber: string;
  floorApartment: string | null;
  city: string;
  province: string;
  postalCode: string;
  references: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}>;

export type PasswordResetRecord = Readonly<{
  userId: string;
  customerId: string;
  expiresAt: Date;
  usedAt: Date | null;
}>;

type SessionInput = Readonly<{
  tokenHash: string;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  occurredAt: Date;
}>;

export interface CustomerRepository {
  findByEmail(email: string): Promise<CustomerRecord | null>;
  createCustomerWithSession(input: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    phone: string;
    document: string | null;
    session: SessionInput;
  }): Promise<CustomerRecord>;
  createSession(userId: string, session: SessionInput): Promise<void>;
  findSessionByTokenHash(tokenHash: string): Promise<CustomerSessionRecord | null>;
  revokeSession(tokenHash: string, revokedAt: Date): Promise<void>;
  createPasswordReset(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    occurredAt: Date;
    ipAddress: string | null;
  }): Promise<void>;
  findPasswordReset(tokenHash: string): Promise<PasswordResetRecord | null>;
  consumePasswordReset(input: {
    tokenHash: string;
    passwordHash: string;
    occurredAt: Date;
    ipAddress: string | null;
  }): Promise<boolean>;
  findById(customerId: string): Promise<CustomerRecord | null>;
  updateProfile(input: {
    customerId: string;
    firstName: string;
    lastName: string;
    phone: string;
    document: string | null;
    occurredAt: Date;
  }): Promise<CustomerRecord | null>;
  listAddresses(customerId: string): Promise<ReadonlyArray<CustomerAddressRecord>>;
  createAddress(customerId: string, input: CustomerAddressInput): Promise<CustomerAddressRecord>;
  updateAddress(
    customerId: string,
    addressId: string,
    input: CustomerAddressInput,
  ): Promise<CustomerAddressRecord | null>;
  deleteAddress(customerId: string, addressId: string): Promise<boolean>;
  setDefaultAddress(customerId: string, addressId: string): Promise<boolean>;
}
