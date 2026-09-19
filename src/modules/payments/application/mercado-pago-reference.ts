export function mercadoPagoExternalReference(orderNumber: bigint, attemptNumber: number): string {
  return `lauril-order-${orderNumber.toString()}-attempt-${attemptNumber}`;
}
