import { describe, expect, it, vi } from "vitest";
import { OrderQueryService } from "@/modules/orders/application/order-query-service";
import type { OrderRepository } from "@/modules/orders/application/order-repository";

const customerId = "10000000-0000-4000-8000-000000000001";

describe("consulta pública de pedidos", () => {
  it("lista únicamente los pedidos del cliente validado", async () => {
    const listCustomerOrders = vi.fn().mockResolvedValue([{
      id: "10000000-0000-4000-8000-000000000002",
      number: 10001n,
      status: "PENDING_PAYMENT",
      totalInCents: 250000n,
      itemCount: 2,
      createdAt: new Date("2026-09-07T12:00:00.000Z"),
    }]);
    const repository = { listCustomerOrders } as unknown as OrderRepository;

    const result = await new OrderQueryService(repository).listCustomer(customerId);

    expect(listCustomerOrders).toHaveBeenCalledWith(customerId);
    expect(result).toHaveLength(1);
    expect(result[0]?.number).toBe(10001n);
  });

  it("rechaza un identificador de cliente inválido antes de consultar persistencia", () => {
    const listCustomerOrders = vi.fn();
    const repository = { listCustomerOrders } as unknown as OrderRepository;

    expect(() => new OrderQueryService(repository).listCustomer("otro-cliente")).toThrow();
    expect(listCustomerOrders).not.toHaveBeenCalled();
  });
});
