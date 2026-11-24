# B1 — Revisión comercial y legal previa a publicación

Los textos públicos de B1 requieren aprobación final del titular de Lauril y
su asesor legal. No publicar hasta completar la identificación fiscal real,
el Formulario 960/D, la configuración de entrega y las decisiones de privacidad
indicadas abajo. Tecnoclean es solamente el punto de retiro.

## Decisiones confirmadas y configuración

- Marca Lauril; vendedor persona humana monotributista distinta del titular de
  Tecnoclean.
- Contacto: `lauril.quimica66@gmail.com` y WhatsApp Business
  `+5492216901425`. Atención lunes a sábado, 9:00–19:00; primera respuesta
  comercial hasta el siguiente día hábil de atención.
- Retiro gratuito: Tecnoclean — Punto de retiro Lauril, Calle 68 N.º 1261,
  entre 20 y 21, La Plata. Retirar solo después del aviso de pedido listo.
- Entrega a domicilio exclusivamente en La Plata (ARS 2.500) y Berisso
  (ARS 3.500). Preparación desde la confirmación del pago: hasta 48 horas
  hábiles. Retiro o entrega: dentro de las 24 horas hábiles posteriores al
  aviso de pedido listo. Revisar el cómputo de horas y feriados con asesor legal.
- Pago en checkout: Mercado Pago Checkout Pro. Efectivo al retirar sigue
  pendiente como desarrollo separado.
- Factura electrónica C manual mediante ARCA — Comprobantes en Línea, PDF
  enviado por email y nota de crédito cuando corresponda.
- Cambio voluntario de fragancia: 15 días corridos, producto sin usar y en
  condiciones originales; diferencia de precio acordada, gestión presencial
  sin cargo adicional y traslados voluntarios acordados previamente. El inicio
  exacto del plazo requiere aprobación legal. No limita garantías ni
  arrepentimiento.

En `/admin/configuracion`, quien tenga `settings.write` debe cargar el email,
WhatsApp y dirección del punto de retiro confirmados en `StoreSettings`. El
campo `businessAddress` representa el punto de retiro, no el domicilio fiscal.
El seed conserva datos anteriores y no actualiza registros existentes.

El titular debe proporcionar por canal privado nombre y apellido, CUIT,
domicilio fiscal, datos complementarios que correspondan y los enlaces
oficiales del Formulario 960/D y su logo generados por ARCA. Hay campos
separados para guardarlos: no cargar datos de Tecnoclean ni claves fiscales.
El nombre, CUIT y domicilio del vendedor deben identificarse públicamente;
el logo 960/D con el enlace oficial debe ser visible en la página principal.
Confirmar con el asesor legal/contable la presentación exacta antes de publicar.

En `/admin/envios` deben estar activos exclusivamente `RETIRO_LOCAL`
(`PICKUP`, ARS 0), `ENVIO_LA_PLATA` (`LOCAL_DELIVERY`, ARS 2.500) y
`ENVIO_BERISSO` (`LOCAL_DELIVERY`, ARS 3.500), sin mínimos ni umbrales de
gratuidad. Crear los dos métodos locales y desactivar `ENVIO_FIJO`,
`ENTREGA_LOCAL`, `A_COORDINAR` y otros métodos antiguos. El checkout B1
oculta y rechaza métodos incompatibles; valida ciudad y provincia antes de
reservar stock. Configurar los métodos antes de publicar: de otro modo solo
estará disponible el retiro.

### Checklist de métodos de entrega

El seed crea `RETIRO_LOCAL` y los tres métodos antiguos, pero no crea
`ENVIO_LA_PLATA` ni `ENVIO_BERISSO`. Verificar su existencia real en cada
entorno antes de crear registros; no ejecutar el seed en producción para
actualizar tarifas.

| Código | Acción en `/admin/envios` | Tipo | Costo | Dirección | Mínimo / envío gratis |
| --- | --- | --- | --- | --- | --- |
| `RETIRO_LOCAL` | Verificar que exista y esté activo | `PICKUP` | ARS 0 | No | Ninguno |
| `ENVIO_LA_PLATA` | Crear si no existe; activar tras el despliegue | `LOCAL_DELIVERY` | ARS 2.500 | Sí | Ninguno |
| `ENVIO_BERISSO` | Crear si no existe; activar tras el despliegue | `LOCAL_DELIVERY` | ARS 3.500 | Sí | Ninguno |

Comprobar totales con una dirección de cada localidad y el rechazo de una
dirección externa. Desactivar `ENVIO_FIJO`, `ENTREGA_LOCAL` y `A_COORDINAR` al
habilitar los métodos nuevos. Los pedidos históricos conservan nombre, tipo,
dirección y costo de entrega registrados; la restricción nueva solo interviene
en la creación de pedidos.

### Sincronización y orden de publicación

El esquema B1 agrega `withdrawal_requests` (claves `request_key` y `code`
únicas, índice por `created_at`) y cinco campos opcionales a `StoreSettings`:
`seller_name`, `seller_cuit`, `seller_fiscal_address`, `fiscal_data_url` y
`fiscal_data_logo_url`. No se cambian pedidos, pagos, reservas ni inventario.
`npm run db:push` ejecuta `prisma db push` y después el script idempotente de
índices parciales; no hay Prisma Migrate ni migraciones SQL.

1. Completar y aprobar identificación fiscal, Data Fiscal y decisiones legales
   y de privacidad. Verificar respaldo restaurable y URI de la base correcta.
2. En una base de prueba independiente, aplicar `npm run db:push`, comprobar
   colección e índices y guardar una solicitud de arrepentimiento. Configurar
   los tres métodos y validar checkout e historial de pedidos antiguos. No
   usar credenciales productivas.
3. En una ventana controlada de producción, verificar respaldo reciente y
   destino de la URI; aplicar `npm run db:push` con autorización de publicación.
   Detenerse ante cualquier aviso de pérdida de datos o cambio de índices no
   previsto.
4. Preparar los dos métodos locales inactivos si no existen. Desplegar B1 con
   el acceso público controlado: hasta activarlos, el checkout nuevo solo
   ofrece el retiro correctamente configurado.
5. Cargar en `StoreSettings` contacto e identidad fiscal reales y los enlaces
   960/D. Activar los métodos locales y desactivar los antiguos. Verificar
   páginas públicas, botón de arrepentimiento, totales y rechazo de destinos
   externos antes de abrir el acceso general.

Si falla el despliegue, mantener el acceso público controlado, desactivar los
métodos nuevos y volver al artefacto anterior solo tras comprobar sus métodos
activos. No reactivar entregas nacionales contrarias a la política aprobada.
Los cambios de esquema son aditivos: conservar colección, índices y campos
nuevos durante la reversión de aplicación, sin borrado manual de datos.

## Facturación operativa

Tras comprobar pedido y pago en la administración, el responsable obtiene
los datos fiscales necesarios, emite manualmente la factura electrónica C en
ARCA — Comprobantes en Línea y envía el PDF al email del cliente. Registra en
un control privado número de pedido, tipo y número de comprobante, fecha de
emisión y entrega. El email de pedido y la constancia de Mercado Pago no son
facturas. La nota de crédito se emite cuando corresponda. El asesor contable
debe validar momento de emisión, identificación del comprador y documentación
de devoluciones. No hay integración automática con ARCA.

## Solicitudes de arrepentimiento

La página `/arrepentimiento` no exige sesión. Guarda cada solicitud en
`withdrawal_requests` con clave de envío única, código `ARR-...`, nombre,
email y fecha UTC; el número de pedido es opcional. La constancia aparece de
inmediato en la misma página.
Un reenvío de la misma clave devuelve el código original. No cancela el pedido,
libera stock ni solicita refunds. La verificación posterior de identidad debe
ser razonable y limitarse a seguridad. No se envía constancia automática por
Resend: el email ingresado es público y no está verificado, por lo que podría
usarse para enviar correos a terceros.

Antes de publicar, el titular debe designar una persona y suplente con acceso
de lectura limitado a `withdrawal_requests` en MongoDB Atlas. No existe panel
ni aviso automático. Procedimiento mínimo:

1. Revisar al menos dos veces al día solicitudes ordenadas por `created_at`.
   Comparar cada código con un registro privado para detectar las pendientes.
2. Registrar código, fecha UTC, responsable y estado operativo. Verificar
   identidad y compra por email o WhatsApp; solicitar número de pedido solo
   cuando sea necesario para localizarla. La falta de número no anula la
   recepción.
3. Contactar al consumidor, coordinar devolución y conservar constancia de
   fechas, comunicaciones y decisión. Para pagos Mercado Pago, comprobar si
   ya hubo reembolso y seguir el procedimiento seguro existente.
4. Registrar resolución, importe, medio, identificador de reembolso y nota de
   crédito si corresponde. No editar manualmente pedido, pago ni stock, ni
   ejecutar devoluciones duplicadas.

Sincronizar el esquema con `npm run db:push` solo en el entorno autorizado y
comprobar una solicitud de prueba sin afectar pagos.

## Privacidad: decisiones pendientes

La política pública describe cuentas, autenticación, contacto, domicilios,
pedidos, pagos, facturación, comunicaciones transaccionales, consultas y
arrepentimiento. El canal de derechos será `lauril.quimica66@gmail.com`.
Solo se observaron cookies necesarias en el código; no se incorporaron
herramientas de medición ni marketing. No hay eliminación automática de
solicitudes de arrepentimiento.

El titular y el asesor legal deben confirmar identidad y domicilio del
responsable, proveedores y ubicaciones reales de tratamiento, posibles
transferencias internacionales, conservación por categoría, eliminación y
procedimiento de acceso, rectificación, actualización y supresión. Verificar
si hay herramientas ajenas al repositorio. No iniciar marketing por defecto.

## Desarrollo independiente pendiente: efectivo al retirar

No implementarlo ni anunciarlo como disponible en B1. El futuro flujo se
limitará a retiro presencial: pedido sin pago online, reserva segura, aviso
de pedido listo, tres días hábiles desde ese aviso, prórroga administrativa
registrada, cancelación manual supervisada, liberación de reserva, registro
manual del cobro y avisos por email/WhatsApp. Definir el cómputo de días y
feriados y la devolución por transferencia o efectivo sin pagos duplicados.

## Referencias para la revisión

- [Ley 24.240, artículo 34](https://www.argentina.gob.ar/normativa/nacional/ley-24240-638/actualizacion): revocación en compras a distancia y devolución a cargo del vendedor.
- [Ley 25.326](https://www.argentina.gob.ar/normativa/nacional/64790/actualizacion): tratamiento de datos y derechos del titular.
- [Disposición 954/2025](https://www.argentina.gob.ar/normativa/nacional/norma-417152/texto): enlace visible, solicitud sin registro y código dentro de 24 horas.
- [Disposición 3/2026](https://www.argentina.gob.ar/normativa/nacional/disposici%C3%B3n-3-2026-423007/texto): verificación de identidad razonable y limitada a seguridad.
- [ARCA, Formulario 960/D](https://arca.gob.ar/960/formulario-960/obligados.asp): logo y enlace oficial visibles en la página principal.

La tienda comercializa productos; este hito no incorpora baja de servicios.
