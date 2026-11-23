# B1 — Revisión comercial y legal previa a publicación

Los textos de `informacion-comercial`, `terminos-y-condiciones`,
`politica-de-privacidad`, `cambios-y-devoluciones` y `envios-y-entregas` son
borradores. No publicar B1 hasta que el responsable comercial y su asesor legal
los revisen y completen los datos confirmados. Los datos desconocidos no se
muestran como ficticios en la tienda.

## Datos pendientes de confirmar

- Titular o razón social, CUIT, condición fiscal y domicilio fiscal que deban
  figurar en la identificación del proveedor y en los comprobantes.
- Responsable y horario del canal de atención, y confirmación del email, teléfono,
  WhatsApp, dirección comercial y redes cargados en `StoreSettings`.
- Modalidades efectivas, zonas, plazos, retiro y costos de entrega; se muestran
  dinámicamente en checkout, pero falta aprobar su redacción general.
- Política comercial para cambios voluntarios, gestión de garantías y coordinación
  de devoluciones, sin limitar derechos legales.
- Responsable del tratamiento de datos, plazo de conservación y procedimiento
  interno para solicitudes de acceso, rectificación y supresión.
- Sistema autorizado usado para emitir comprobantes fiscales, responsable de
  emitirlos, tipo de comprobante según cada operación y canal de entrega.

## Facturación operativa

Tras comprobar pedido y pago en la administración, el responsable de facturación
obtiene los datos fiscales necesarios por el canal habitual, emite el comprobante
en el sistema autorizado que utilice el comercio y lo entrega por el canal
acordado. Registra internamente el número de pedido, tipo y número de comprobante,
fecha de emisión y fecha/canal de entrega, sin presentar emails de pedido ni
constancias de Mercado Pago como facturas. Ante cancelación o devolución, la
eventual nota de crédito se evalúa en ese mismo sistema con asesoramiento contable.
No hay integración automática con ARCA.

## Solicitudes de arrepentimiento

La página `/arrepentimiento` no exige sesión. Guarda cada solicitud en
`withdrawal_requests` con clave de envío única, código `ARR-...`, nombre,
email y fecha UTC; el número de pedido es opcional. La constancia aparece de
inmediato en la misma página.
Un reenvío de la misma clave devuelve el código original. No cancela el pedido ni
solicita refunds. El operador debe revisar la colección al menos dos veces por
día, verificar identidad y pedido por un medio razonable, registrar la resolución
en su control operativo y coordinar la devolución/reembolso que corresponda.
Las solicitudes no deben resolverse mediante escrituras manuales de stock o pagos.
Antes del despliegue, sincronizar el esquema con `npm run db:push` en el entorno
correspondiente y comprobar una solicitud de prueba sin afectar pagos.

## Referencias para la revisión

- [Ley 24.240, artículo 34](https://www.argentina.gob.ar/normativa/nacional/ley-24240-638/actualizacion): revocación en compras a distancia y devolución a cargo del vendedor.
- [Ley 25.326](https://www.argentina.gob.ar/normativa/nacional/64790/actualizacion): tratamiento de datos y derechos del titular.
- [Disposición 954/2025](https://www.argentina.gob.ar/normativa/nacional/norma-417152/texto): enlace visible, solicitud sin registro y código dentro de 24 horas.
- [Disposición 3/2026](https://www.argentina.gob.ar/normativa/nacional/disposici%C3%B3n-3-2026-423007/texto): verificación de identidad razonable y limitada a seguridad.

La tienda comercializa productos; este hito no incorpora baja de servicios.
