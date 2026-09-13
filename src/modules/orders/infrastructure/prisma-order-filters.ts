import { Prisma } from "@/generated/prisma/client";

export const reservationNotReleasedWhere = {
  OR: [
    { reservationReleasedAt: null },
    { reservationReleasedAt: { isSet: false } },
  ],
} satisfies Prisma.OrderWhereInput;
