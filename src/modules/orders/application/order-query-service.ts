import { NotFoundError } from "@/shared/domain/errors";
import { parseOrderNumber, validateId } from "../domain/order";
import type { OrderRepository } from "./order-repository";

export class OrderQueryService {
  constructor(private readonly repository: OrderRepository) {}

  async findPublic(number: string, owner: { customerId: string | null; guestTokenHash: string | null }) {
    const order = await this.repository.findPublicOrder(parseOrderNumber(number), owner);
    if (!order) throw new NotFoundError("No se encontró el pedido.");
    return order;
  }

  listAdmin() {
    return this.repository.listAdminOrders();
  }

  async findAdmin(id: string) {
    const order = await this.repository.findAdminOrder(validateId(id));
    if (!order) throw new NotFoundError("No se encontró el pedido.");
    return order;
  }
}
