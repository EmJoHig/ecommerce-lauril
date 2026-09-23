# Pagos

F14 está completada y validada con integración real de prueba en staging aislado.
La implementación utiliza Mercado Pago Checkout Pro mediante Orders API, no
Preferences. Mercado Pago está habilitado en producción con
`MERCADO_PAGO_ENABLED=true`. F15 completó la habilitación comercial el 2026-09-22
al verificar que la configuración ya estaba activa en producción.
El valor por defecto y la configuración de ejemplo pueden seguir en `false`
hasta que cada entorno sea habilitado explícitamente; cerrar F14 no activa pagos.

## Contrato y persistencia

`PaymentGateway` usa DTOs propios, sin dependencia del dominio en Prisma o un SDK:

```ts
interface PaymentGateway {
  createCheckout(input: CreateExternalCheckoutInput): Promise<ExternalCheckout>;
  getPaymentState(providerResourceId: string): Promise<ExternalPaymentState>;
  refundOrder(input: RefundOrderInput): Promise<ExternalRefundResult>;
}
```

`MercadoPagoOrdersGateway` implementa el contrato con `fetch` nativo, timeout y
errores normalizados. Tokens y secretos permanecen en el servidor, fuera de HTML,
respuestas públicas y logs. La firma del webhook se verifica por separado.

- `PaymentAttempt`: historial 1:N por pedido, número de intento, importe y moneda,
  recurso externo, estado y clave de idempotencia persistida.
- `PaymentEvent`: inbox deduplicable con metadata mínima y estados `RECEIVED`,
  `PROCESSED`, `IGNORED` o `FAILED`; no guarda body crudo ni firmas.
- `PaymentRefund`: operación FULL/PARTIAL con importe, clave propia, metadata
  externa mínima y estados `CREATED`, `SUBMITTED`, `CONFIRMED`, `FAILED` o
  `REQUIRES_REVIEW`.

Los importes se representan en centavos enteros (`bigint`); la conversión a
decimales del provider no usa floats.

## Creación de checkout

1. El checkout local valida carrito, identidad, envío y stock; crea el pedido
   `PENDING_PAYMENT` y reserva `stockReserved` sin movimientos físicos.
2. `StartPaymentCheckout` exige pedido pendiente, no vencido y reserva no liberada.
   La presentación comprueba acceso del cliente/invitado y aplica rate limit.
3. Adquiere o reutiliza un `PaymentAttempt` y llama fuera de la transacción a
   `POST /v1/orders` con su `X-Idempotency-Key` persistida.
4. Guarda recurso externo, estado y URL HTTPS del checkout. Si ya dispone de esa
   URL, la reutiliza sin repetir el POST.
5. El retorno del navegador sólo informa al comprador: nunca confirma el pago.

## Webhook y aprobación autoritativa

`POST /api/payments/mercado-pago/webhook` verifica HMAC-SHA256 con
`timingSafeEqual`. Normaliza espacios y construye el manifest con `data.id` del
query, `x-request-id` y el timestamp firmado; `data.id` en minúsculas es siempre primario.
Sólo si falla esa firma y el ID cumple `^ORDTST[A-Z0-9]+$`, admite compatibilidad
sandbox con `data.id` en casing exacto, usando el mismo secreto, request ID y timestamp.
La consulta y el procesamiento conservan el ID original. Orders productivas
exigen minúsculas en el manifest. El log de compatibilidad no incluye firmas ni secretos.

Una firma inválida devuelve 401. Tras autenticar se limita y valida el body, cuyo
`data.id` debe coincidir con el query. El inbox usa `body.id` como `providerEventId`
cuando existe; Checkout Pro Orders puede omitirlo, por lo que se usa entonces
`request:<x-request-id>` autenticado, con límite de 255 caracteres. `data.id` es
`providerResourceId`, no un ID de notificación.

El evento se persiste antes de consultar `GET /v1/orders/{id}`, única fuente de
verdad del pago. Sólo `processed/accredited`, con recurso, referencia, moneda ARS,
total y total pagado coherentes, habilita aprobación automática.

Una transacción MongoDB relee evento, intento, pedido y reserva; convierte la
reserva en venta consumiendo `stockOnHand` y `stockReserved`, registra `SALE`,
transiciona `PENDING_PAYMENT -> PAID`, crea historial y confirma intento/evento.
Los controles de versión, escrituras condicionales e índice único de SALE por
inventario/pedido impiden repetir efectos físicos o la transición PAID.

## Idempotencia y estados

- Las claves únicas del checkout local evitan duplicar pedidos.
- Cada intento nuevo recibe número y clave nuevos; el retry técnico conserva la
  clave. El índice parcial `CREATED/PENDING` permite como máximo un intento activo.
- `PaymentEvent(provider, providerEventId)` deduplica notificaciones. Un request ID
  distinto no evita las defensas transaccionales de estado e inventario.
- Cada refund nuevo tiene su propia UUID; un timeout o retry no genera otra clave.
  El índice parcial `CREATED/SUBMITTED` permite como máximo un refund activo por intento.

Los estados externos pendientes/processing mantienen el intento `PENDING` y no
modifican pedido ni inventario. `failed` termina el intento como `REJECTED` y
`canceled` como `CANCELLED`; ambos conservan el pedido `PENDING_PAYMENT` mientras
su reserva siga vigente. El cliente puede crear otro intento sobre el mismo pedido,
sin cambiar su checkout key. `Order.PAYMENT_REJECTED` no representa el rechazo de
un intento individual.

`CREATED`, `PENDING`, `APPROVED`, `PARTIALLY_REFUNDED` y `REQUIRES_REVIEW` no
habilitan un nuevo intento. Un intento totalmente `REFUNDED` sólo puede permitirlo
si nunca hubo venta local y el pedido pendiente conserva una reserva válida.
Combinaciones desconocidas o incoherencias quedan `REQUIRES_REVIEW`, sin asumir
aprobación ni alterar inventario; requieren revisión operativa.

## Reembolsos parciales y totales

Administración exige `orders.write`, feature flag habilitada y un pedido
`PAID/PARTIALLY_REFUNDED` con intento coherente. Valida importe positivo que no
supere el restante reembolsable. Solicitar exactamente el restante se trata como FULL.

El FULL usa `POST /v1/orders/{id}/refund` sin body de monto. El PARTIAL envía
`transactions: [{ id, amount }]`, con ID de pago inequívoco y monto decimal exacto.
Si hay múltiples pagos y no puede elegirse uno inequívocamente, no se adivina.
La aceptación de la solicitud deja el refund `SUBMITTED`: la UI informa que espera
confirmación, no muestra de inmediato el pedido como reembolsado.

El GET autoritativo calcula el acumulado desde `transactions.refunds[].amount`
sumando centavos exactamente. Datos insuficientes para calcularlo requieren revisión.
La confirmación actualiza intento y refund local cuando puede correlacionarlo,
limpia su error y registra fecha de confirmación. Las transiciones son
`PAID -> PARTIALLY_REFUNDED/REFUNDED` o `PARTIALLY_REFUNDED -> REFUNDED`;
el historial sólo se agrega si cambia realmente el estado, con actor nulo para el provider.

Refund no equivale a devolución física: nunca repone stock, crea RETURN/CANCELLATION
ni reconstruye reservas. Una devolución física requiere otra operación administrativa
explícita. La solicitud administrativa deja auditoría mínima, sin datos sensibles.

## Pago tardío y recuperación

La expiración local libera reserva y cancela el pedido sin llamadas HTTP al provider.
Si luego se acredita un checkout viejo, la validación autoritativa detecta la
cancelación/liberación o falta de reserva: no vende ni vuelve a reservar; crea o
reutiliza un refund FULL persistido con su propia idempotencia.

Los fallos transitorios usan el retry existente del webhook: evento `FAILED` y
respuesta 5xx, conservando refund y clave. Exclusivamente en este auto-refund,
`INVALID_REQUEST` con `providerCode=unprocessable_content` también es transitorio;
no cambia la clasificación global de 422 ni los refunds administrativos.
Los errores permanentes dejan intento/refund `REQUIRES_REVIEW`, evento procesado
y log seguro, sin un ciclo automático de 5xx.

La confirmación autoritativa total para un pedido CANCELLED deja
`PaymentAttempt=REFUNDED` y reconcilia el FULL correspondiente a `CONFIRMED`,
incluso si quedó `REQUIRES_REVIEW`, cuando la correspondencia por intento, recurso
e importe es inequívoca. Limpia `failureCode`, establece `confirmedAt` y actualiza
el estado del provider, sin crear otro refund.
El pedido permanece `CANCELLED`: no hubo venta local, no hay SALE ni cambios de
`stockOnHand`, y `stockReserved` permanece en cero tras la expiración.

No existe un scheduler de conciliación. La recuperación utiliza webhooks y su
consulta autoritativa; los casos ambiguos requieren intervención operativa.

## Validación de F14E

En staging aislado se validaron pagos automáticos aprobados y pendientes,
cancelación de intento y nuevo intento aprobado, una única SALE/transición PAID,
webhooks duplicados sin repetir efectos, refunds parciales/totales sin restock y
pago tardío con retry idempotente y reconciliación final. Son pruebas de integración
de F14; no equivalen a habilitación comercial ni activan producción. F15 quedó
completada el 2026-09-22 con E2E, validación real controlada de pago/webhook en
producción y verificación final de la habilitación comercial ya activa, según
el registro de [ROADMAP.md](ROADMAP.md) y [OPERATIONS.md](OPERATIONS.md).
