# Envíos

El módulo separa reglas de cotización del proveedor concreto.

## Contrato

```ts
interface ShippingProvider {
  quote(input: ShippingQuoteInput): Promise<ShippingQuote[]>;
  createShipment(input: CreateShipmentInput): Promise<ShipmentResult>;
  getTracking(reference: string): Promise<TrackingResult>;
  cancelShipment(reference: string): Promise<void>;
}
```

`CustomShippingProvider` calculará los métodos administrables sin una API externa.
Las futuras integraciones (Correo Argentino, Andreani, OCA) implementarán el mismo
contrato y traducirán sus estados a estados internos.

## Métodos iniciales

- retiro en local;
- envío local;
- envío por zona;
- envío por código postal o rango;
- tarifa fija;
- envío gratis;
- envío gratis desde un importe;
- envío a coordinar.

Cada método define nombre y descripción públicas, tipo, costo en centavos, compra
mínima/máxima opcional, umbral de gratuidad, prioridad y estado. Zonas y códigos
postales se modelan aparte para no guardar listas opacas imposibles de indexar.

## Cotización

El servidor recibe código postal/dirección y un carrito ya recalculado. Filtra
métodos activos y vigentes, evalúa límites y zonas, calcula gratuidad y devuelve
opciones ordenadas. En checkout vuelve a cotizar y guarda en el pedido el nombre,
tipo y costo elegidos como snapshot.

## Estados y trazabilidad

`Shipment` comienza con `PENDING`, `READY`, `SHIPPED`, `DELIVERED`, `CANCELLED` y
`EXCEPTION`. Cambios guardan fecha, actor/proveedor, tracking y evento original
sanitizado cuando exista. Los webhooks de transportistas siguen el mismo patrón de
inbox e idempotencia definido para pagos.

## Administración

Validaciones relevantes: costos no negativos, mínimo no mayor que máximo, rangos
postales sin extremos invertidos y prioridades deterministas. Desactivar un método
no altera pedidos históricos.
