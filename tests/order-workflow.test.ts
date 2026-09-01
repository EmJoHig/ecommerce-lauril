import { describe, expect, it } from "vitest";
import {
  allowedAdministrativeTransitions,
  assertOrderTransition,
  normalizeOrderNote,
  normalizeOrderTransitionReason,
} from "@/modules/orders/domain/order";
import { ValidationError } from "@/shared/domain/errors";

describe("order state machine", () => {
  it("reserva PAID exclusivamente para la fuente de pagos", () => {
    expect(() => assertOrderTransition({ from: "PENDING_PAYMENT", to: "PAID", shippingMethodType: "FLAT_RATE", source: "ADMIN" })).toThrow(ValidationError);
    expect(() => assertOrderTransition({ from: "PENDING_PAYMENT", to: "PAID", source: "PAYMENT" })).not.toThrow();
  });

  it("centraliza también la expiración del sistema", () => {
    expect(() => assertOrderTransition({ from: "PENDING_PAYMENT", to: "CANCELLED", source: "SYSTEM" })).not.toThrow();
    expect(() => assertOrderTransition({ from: "PAID", to: "CANCELLED", source: "SYSTEM" })).toThrow(ValidationError);
  });

  it("permite cancelar únicamente un pendiente desde administración", () => {
    expect(allowedAdministrativeTransitions("PENDING_PAYMENT", "FLAT_RATE")).toEqual(["CANCELLED"]);
    expect(() => assertOrderTransition({ from: "PAID", to: "CANCELLED", shippingMethodType: "FLAT_RATE", source: "ADMIN" })).toThrow(ValidationError);
  });

  it("define el flujo completo para un envío", () => {
    expect(allowedAdministrativeTransitions("PAID", "FLAT_RATE")).toEqual(["PREPARING"]);
    expect(allowedAdministrativeTransitions("PREPARING", "FLAT_RATE")).toEqual(["READY_TO_SHIP"]);
    expect(allowedAdministrativeTransitions("READY_TO_SHIP", "FLAT_RATE")).toEqual(["SHIPPED"]);
    expect(allowedAdministrativeTransitions("SHIPPED", "FLAT_RATE")).toEqual(["DELIVERED"]);
  });

  it("permite que pickup pase de listo a entregado sin despacho", () => {
    expect(allowedAdministrativeTransitions("READY_TO_SHIP", "PICKUP")).toEqual(["DELIVERED"]);
    expect(() => assertOrderTransition({ from: "READY_TO_SHIP", to: "DELIVERED", shippingMethodType: "PICKUP", source: "ADMIN" })).not.toThrow();
  });

  it("impide saltar estados en un envío", () => {
    expect(() => assertOrderTransition({ from: "READY_TO_SHIP", to: "DELIVERED", shippingMethodType: "LOCAL_DELIVERY", source: "ADMIN" })).toThrow(ValidationError);
    expect(() => assertOrderTransition({ from: "PREPARING", to: "SHIPPED", shippingMethodType: "FLAT_RATE", source: "ADMIN" })).toThrow(ValidationError);
  });

  it("mantiene terminales los pedidos entregados y cancelados", () => {
    expect(allowedAdministrativeTransitions("DELIVERED", "PICKUP")).toEqual([]);
    expect(allowedAdministrativeTransitions("CANCELLED", "FLAT_RATE")).toEqual([]);
  });

  it("valida motivos e internaliza espacios", () => {
    expect(normalizeOrderTransitionReason("  Salió   por correo ", "fallback")).toBe("Salió por correo");
    expect(normalizeOrderTransitionReason(undefined, "Motivo por defecto")).toBe("Motivo por defecto");
    expect(() => normalizeOrderTransitionReason("x", "fallback")).toThrow(ValidationError);
  });

  it("valida notas sin exponerlas al modelo público", () => {
    expect(normalizeOrderNote("  Revisar\r\nembalaje  ")).toBe("Revisar\nembalaje");
    expect(() => normalizeOrderNote(" ")).toThrow(ValidationError);
    expect(() => normalizeOrderNote("x".repeat(2001))).toThrow(ValidationError);
  });
});
