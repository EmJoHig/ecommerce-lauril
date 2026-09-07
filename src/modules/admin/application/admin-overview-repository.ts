export type AdminOverview = Readonly<{
  activeProducts: number; lowStockVariants: number; registeredCustomers: number;
  pendingOrders: number; preparingOrders: number;
}>;

export interface AdminOverviewRepository {
  getOverview(): Promise<AdminOverview>;
}
