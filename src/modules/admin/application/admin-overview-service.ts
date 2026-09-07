import type { AdminOverviewRepository } from "./admin-overview-repository";

export class AdminOverviewService {
  constructor(private readonly repository: AdminOverviewRepository) {}
  getOverview() { return this.repository.getOverview(); }
}
