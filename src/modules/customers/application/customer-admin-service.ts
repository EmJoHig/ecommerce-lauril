import { z } from "zod";
import { businessDate, boundedPageSize, normalizedSearch, positivePage } from "@/shared/application/admin-list-query";
import { NotFoundError } from "@/shared/domain/errors";
import { normalizeCustomerNote, normalizeCustomerProfile, type CustomerProfileInput } from "../domain/customer";
import { customerAdminSorts, type CustomerAdminRepository } from "./customer-admin-repository";
import type { CustomerStatusValue } from "./customer-repository";

export class CustomerAdminService {
  constructor(private readonly repository: CustomerAdminRepository) {}

  list(input: Readonly<{
    page?: number; pageSize?: number; search?: string; status?: string;
    orderPresence?: string; createdFrom?: string; createdTo?: string; sort?: string;
  }>) {
    const status = (["ACTIVE", "DISABLED"] as const).find((value) => value === input.status);
    const orderPresence = (["with-orders", "without-orders"] as const).find((value) => value === input.orderPresence);
    const sort = customerAdminSorts.find((value) => value === input.sort) ?? "newest";
    const search = normalizedSearch(input.search);
    const createdFrom = businessDate(input.createdFrom);
    const createdToExclusive = businessDate(input.createdTo, true);
    return this.repository.list({
      page: positivePage(input.page), pageSize: boundedPageSize(input.pageSize), sort,
      ...(search ? { search } : {}), ...(status ? { status } : {}),
      ...(orderPresence ? { orderPresence } : {}), ...(createdFrom ? { createdFrom } : {}),
      ...(createdToExclusive ? { createdToExclusive } : {}),
    });
  }

  async find(id: string) {
    const customer = await this.repository.find(z.uuid().parse(id));
    if (!customer) throw new NotFoundError("No se encontró el cliente.");
    return customer;
  }

  async updateProfile(input: CustomerProfileInput & { customerId: string; actorUserId: string }, now = new Date()) {
    const profile = normalizeCustomerProfile(input);
    const customer = await this.repository.updateProfile({
      customerId: z.uuid().parse(input.customerId), actorUserId: z.uuid().parse(input.actorUserId),
      ...profile, occurredAt: now,
    });
    if (!customer) throw new NotFoundError("No se encontró el cliente.");
    return customer;
  }

  async setStatus(input: { customerId: string; status: CustomerStatusValue; actorUserId: string }, now = new Date()) {
    const customer = await this.repository.setStatus({
      customerId: z.uuid().parse(input.customerId), actorUserId: z.uuid().parse(input.actorUserId),
      status: z.enum(["ACTIVE", "DISABLED"]).parse(input.status), occurredAt: now,
    });
    if (!customer) throw new NotFoundError("No se encontró el cliente.");
    return customer;
  }

  async addNote(input: { customerId: string; actorUserId: string; content: string }, now = new Date()) {
    const customer = await this.repository.addNote({
      customerId: z.uuid().parse(input.customerId), actorUserId: z.uuid().parse(input.actorUserId),
      content: normalizeCustomerNote(input.content), occurredAt: now,
    });
    if (!customer) throw new NotFoundError("No se encontró el cliente.");
    return customer;
  }
}
