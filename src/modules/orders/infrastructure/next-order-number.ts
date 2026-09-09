import type { PrismaClient } from "@/generated/prisma/client";

type SequenceClient = Pick<PrismaClient, "sequence">;

export async function nextOrderNumber(client: SequenceClient): Promise<bigint> {
  const sequence = await client.sequence.upsert({
    where: { id: "order-number" },
    update: { value: { increment: 1n } },
    create: { id: "order-number", value: 10001n },
    select: { value: true },
  });
  return sequence.value;
}
