import type { PrismaClient } from "@/generated/prisma/client";
import type { AdminOverviewRepository } from "../application/admin-overview-repository";

export class PrismaAdminOverviewRepository implements AdminOverviewRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getOverview() {
    const [activeProducts, lowStock, registeredCustomers, pendingOrders, preparingOrders] = await Promise.all([
      this.prisma.product.count({ where: { status: "ACTIVE" } }),
      this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS count FROM inventory
        WHERE stock_on_hand - stock_reserved <= minimum_stock
      `,
      this.prisma.customer.count(),
      this.prisma.order.count({ where: { status: "PENDING_PAYMENT" } }),
      this.prisma.order.count({ where: { status: { in: ["PREPARING", "READY_TO_SHIP"] } } }),
    ]);
    return {
      activeProducts, lowStockVariants: Number(lowStock[0]?.count ?? 0n), registeredCustomers,
      pendingOrders, preparingOrders,
    };
  }
}
