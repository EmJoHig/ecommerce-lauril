# Pagos

Mercado Pago Checkout Pro será el primer gateway, pero el dominio no depende de su
SDK. Esta integración comienza en una fase posterior.

## Contrato

```ts
interface PaymentGateway {
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession>;
  getPayment(externalPaymentId: string): Promise<GatewayPayment>;
  refund(input: RefundInput): Promise<GatewayRefund>;
  verifyWebhook(input: WebhookRequest): Promise<VerifiedGatewayEvent>;
}
```

`MercadoPagoPaymentGateway` traduce modelos externos a DTOs propios. Access tokens
y secretos se leen en el servidor desde variables de entorno; nunca forman parte
de props, HTML, logs ni respuestas públicas.

## Flujo Checkout Pro

1. El servidor valida carrito, identidad/dirección, promociones, envío y stock.
2. En una transacción crea `Order`/`OrderItem` con snapshots y el intento `Payment`
   pendiente; reserva inventario y registra movimientos.
3. Fuera de la transacción crea la preferencia usando una idempotency key estable.
4. Guarda identificadores de preferencia y entrega al navegador solo la URL
   pública de checkout.
5. El retorno del navegador muestra “estamos verificando”; no marca el pago.
6. El webhook verifica firma, timestamp y tolerancia, persiste el evento por su ID
   único y responde rápido.
7. Un procesador consulta el pago a Mercado Pago cuando corresponde, bloquea el
   intento local y aplica la transición en una transacción.
8. Los efectos posteriores (email, preparación) usan outbox/idempotency keys.

## Idempotencia

- `Order.checkoutKey` evita crear dos pedidos por doble submit.
- `Payment.idempotencyKey` evita preferencias/intentos duplicados.
- `PaymentEvent(provider, providerEventId)` es único.
- El cambio de estado usa compare-and-set y una tabla de historial.
- El descuento/confirmación de stock tiene referencia única por pedido y tipo.
- Emails y reembolsos reciben una clave idempotente propia.

Un evento repetido se reconoce y devuelve éxito sin repetir efectos. Eventos fuera
de orden se comparan contra el estado consultado al proveedor y la máquina de
transiciones; no se confía en el orden de llegada.

## Estados

`Payment`: `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`, `REFUNDED`,
`PARTIALLY_REFUNDED`. Los estados externos se mapean explícitamente; un valor nuevo
o desconocido se registra y queda pendiente de revisión, no se asume aprobado.

## Webhooks

- Verificar cabeceras/firma según documentación vigente al implementar.
- Comparar secretos en tiempo constante y limitar tamaño de payload.
- Registrar IDs y resultado, no credenciales ni datos sensibles completos.
- Aplicar rate limiting defensivo sin impedir reintentos legítimos.
- Responder 2xx una vez persistido; reprocesar fallos controladamente.

## Conciliación

Una tarea periódica buscará pagos pendientes/ambiguos, consultará Mercado Pago y
reconciliará. Las métricas alertarán eventos fallidos, pagos aprobados sin pedido
pagado y pedidos vencidos con stock reservado.
