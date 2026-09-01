import { z } from "zod";
import { NotFoundError } from "@/shared/domain/errors";
import { parseMoneyInputToCents } from "@/shared/domain/money";
import { normalizeShippingCode, shippingMethodTypes, validateShippingMethodDraft } from "../domain/shipping";
import type { ShippingAdminRepository, ShippingMethodWrite } from "./shipping-admin-repository";

const inputSchema = z.object({
  code: z.string().trim().min(2).max(80),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().default(""),
  type: z.enum(shippingMethodTypes),
  cost: z.string().trim().min(1),
  requiresAddress: z.boolean().default(true),
  minimumSubtotal: z.string().trim().optional().default(""),
  freeShippingFrom: z.string().trim().optional().default(""),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10000),
});

export type ShippingAdminInput = z.input<typeof inputSchema>;

export class ShippingAdminService {
  constructor(private readonly repository: ShippingAdminRepository) {}

  list() {
    return this.repository.listAll();
  }

  async get(id: string) {
    const method = await this.repository.findById(z.uuid().parse(id));
    if (!method) throw new NotFoundError("No se encontró el método de entrega.");
    return method;
  }

  create(raw: ShippingAdminInput, actorUserId: string) {
    return this.repository.create(normalizeInput(raw), z.uuid().parse(actorUserId));
  }

  async update(id: string, raw: ShippingAdminInput, actorUserId: string) {
    const method = await this.repository.update(
      z.uuid().parse(id),
      normalizeInput(raw),
      z.uuid().parse(actorUserId),
    );
    if (!method) throw new NotFoundError("No se encontró el método de entrega.");
    return method;
  }

  async setActive(id: string, isActive: boolean, actorUserId: string): Promise<void> {
    if (!(await this.repository.setActive(z.uuid().parse(id), isActive, z.uuid().parse(actorUserId)))) {
      throw new NotFoundError("No se encontró el método de entrega.");
    }
  }
}

function normalizeInput(raw: ShippingAdminInput): ShippingMethodWrite {
  const input = inputSchema.parse(raw);
  const requiresAddress = input.type === "LOCAL_DELIVERY"
    ? true
    : input.type === "FLAT_RATE"
      ? input.requiresAddress
      : false;
  return validateShippingMethodDraft({
    code: normalizeShippingCode(input.code),
    name: input.name,
    description: input.description || null,
    type: input.type,
    costInCents: parseMoneyInputToCents(input.cost),
    requiresAddress,
    minimumSubtotalInCents: input.minimumSubtotal ? parseMoneyInputToCents(input.minimumSubtotal) : null,
    freeShippingFromInCents: input.freeShippingFrom ? parseMoneyInputToCents(input.freeShippingFrom) : null,
    isActive: input.isActive,
    sortOrder: input.sortOrder,
  });
}
