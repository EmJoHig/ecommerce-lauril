# Envíos

## Implementación de Fase 5

`ShippingProvider` es el puerto de cotización y `CustomShippingProvider` su primer
adaptador. Lee métodos administrables desde PostgreSQL y devuelve cotizaciones en
centavos; el checkout nunca acepta un costo enviado por el navegador.

Tipos disponibles:

- `PICKUP`: retiro sin dirección;
- `FLAT_RATE`: tarifa fija, con dirección configurable;
- `LOCAL_DELIVERY`: siempre requiere dirección;
- `TO_COORDINATE`: no solicita dirección durante este checkout.

Cada `ShippingMethod` define código, nombre, descripción, costo, compra mínima,
umbral de envío gratis, estado y orden. El servidor descarta métodos inactivos o
que no alcanzan el mínimo y vuelve a cotizar dentro de la transacción. El pedido
guarda snapshots de nombre, tipo, requisito de dirección y costo.

La administración vive en `/admin/envios`, exige `shipping.read` o
`shipping.write` y audita alta, edición y activación. El seed crea retiro, tarifa
fija, entrega local y envío a coordinar sin sobrescribir métodos ya existentes.

## Evolución posterior

Zonas, rangos postales, máximos de compra, `Shipment`, tracking y adaptadores de
Correo Argentino, Andreani u OCA permanecen fuera de Fase 5. Podrán implementar el
mismo puerto sin acoplar `orders` a sus SDKs. Desactivar un método nunca modifica
pedidos históricos.
