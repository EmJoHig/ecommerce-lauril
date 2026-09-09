import type { PrismaClient } from "@/generated/prisma/client";
import type { AdminOverviewRepository } from "../application/admin-overview-repository";

export class PrismaAdminOverviewRepository implements AdminOverviewRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getOverview() {
    const [activeProducts, inventories, registeredCustomers, pendingOrders, preparingOrders] = await Promise.all([
      this.prisma.product.count({ where: { status: "ACTIVE" } }),
      this.prisma.inventory.findMany({
        select: { stockOnHand: true, stockReserved: true, minimumStock: true },
      }),
      this.prisma.customer.count(),
      this.prisma.order.count({ where: { status: "PENDING_PAYMENT" } }),
      this.prisma.order.count({ where: { status: { in: ["PREPARING", "READY_TO_SHIP"] } } }),
    ]);
    return {
      activeProducts,
      lowStockVariants: inventories.filter(
        ({ stockOnHand, stockReserved, minimumStock }) =>
          stockOnHand - stockReserved <= minimumStock,
      ).length,
      registeredCustomers,
      pendingOrders, preparingOrders,
    };
  }
}
