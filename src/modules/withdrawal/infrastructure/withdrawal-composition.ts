import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { ConflictError } from "@/shared/domain/errors";
import { getPrisma } from "@/shared/infrastructure/prisma";
import { RecordWithdrawalRequest, type WithdrawalRequestRepository } from "../application/record-withdrawal-request";

export function getRecordWithdrawalRequest(): RecordWithdrawalRequest {
  const prisma = getPrisma();
  const repository: WithdrawalRequestRepository = {
    async createOrFind(input) {
      const orderNumber = input.orderNumber === null ? null : BigInt(input.orderNumber);
      const existing = await prisma.withdrawalRequest.findUnique({ where: { requestKey: input.requestKey } });
      if (existing) {
        if (existing.orderNumber !== orderNumber || existing.name !== input.name || existing.email !== input.email) {
          throw new ConflictError("La clave de solicitud ya fue utilizada.");
        }
        return { code: existing.code, createdAt: existing.createdAt };
      }
      try {
        const created = await prisma.withdrawalRequest.create({
          data: { ...input, orderNumber },
        });
        return { code: created.code, createdAt: created.createdAt };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          const concurrent = await prisma.withdrawalRequest.findUnique({ where: { requestKey: input.requestKey } });
          if (concurrent) {
            if (concurrent.orderNumber !== orderNumber || concurrent.name !== input.name || concurrent.email !== input.email) {
              throw new ConflictError("La clave de solicitud ya fue utilizada.");
            }
            return { code: concurrent.code, createdAt: concurrent.createdAt };
          }
        }
        throw error;
      }
    },
  };
  return new RecordWithdrawalRequest(repository);
}
