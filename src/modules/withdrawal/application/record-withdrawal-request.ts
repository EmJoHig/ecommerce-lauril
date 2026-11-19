import { randomUUID } from "node:crypto";
import { z } from "zod";

export const withdrawalInputSchema = z.object({
  requestKey: z.uuid(),
  orderNumber: z.string().trim().regex(/^[1-9][0-9]{0,17}$/, "Ingresá un número de pedido válido."),
  name: z.string().trim().min(2).max(100).regex(/^[^\r\n]+$/),
  email: z.email().max(160).transform((value) => value.toLowerCase()),
  website: z.string().max(0),
});

export type WithdrawalInput = z.infer<typeof withdrawalInputSchema>;

export interface WithdrawalRequestRepository {
  createOrFind(input: Omit<WithdrawalInput, "website"> & { code: string }): Promise<{ code: string; createdAt: Date }>;
}

export class RecordWithdrawalRequest {
  constructor(private readonly repository: WithdrawalRequestRepository) {}

  async execute(input: WithdrawalInput): Promise<{ code: string; createdAt: Date }> {
    return this.repository.createOrFind({
      requestKey: input.requestKey,
      orderNumber: input.orderNumber,
      name: input.name,
      email: input.email,
      code: `ARR-${randomUUID().toUpperCase()}`,
    });
  }
}
