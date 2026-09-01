import type { OrderStatusValue } from "../domain/order";

const labels: Readonly<Record<OrderStatusValue, string>> = {
  PENDING_PAYMENT: "Pendiente de pago",
  PAID: "Pagado",
  PREPARING: "En preparación",
  READY_TO_SHIP: "Listo para entregar",
  SHIPPED: "Despachado",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
  PAYMENT_REJECTED: "Pago rechazado",
  REFUNDED: "Reembolsado",
  PARTIALLY_REFUNDED: "Reembolso parcial",
};

export function orderStatusLabel(status: OrderStatusValue): string {
  return labels[status];
}

export function orderStatusClass(status: OrderStatusValue): string {
  if (["PAID", "DELIVERED"].includes(status)) return "active";
  if (["PENDING_PAYMENT", "PREPARING", "READY_TO_SHIP", "SHIPPED"].includes(status)) return "draft";
  return "inactive";
}

export function transitionLabel(status: OrderStatusValue, pickup: boolean): string {
  const transitionLabels: Partial<Record<OrderStatusValue, string>> = {
    CANCELLED: "Cancelar pedido",
    PREPARING: "Comenzar preparación",
    READY_TO_SHIP: pickup ? "Marcar listo para retirar" : "Marcar listo para despachar",
    SHIPPED: "Registrar despacho",
    DELIVERED: "Marcar entregado",
  };
  return transitionLabels[status] ?? status;
}
