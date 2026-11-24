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
  (ARS 3.500). Para Mercado Pago, preparar hasta 2 días hábiles desde la
  acreditación del pago. Desde que el pedido está listo, entregar a domicilio
  hasta 1 día hábil adicional o disponer el retiro hasta 1 día hábil adicional.
  Atención lunes a sábado, 9:00–19:00; domingos y feriados sin actividad.
  Revisar el cómputo exacto de días y feriados con asesor legal.
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
El seed ahora crea instalaciones nuevas con contacto, punto de retiro y tres
tarifas aprobadas. Sus `upsert` usan `update: {}`: no corrige registros ya
existentes. Revisar y actualizar manualmente el email anterior
`hola@lauril.com.ar`, el domicilio genérico `Buenos Aires, Argentina`, la
descripción comercial antigua y los métodos heredados si están presentes.

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
gratuidad. Crear los dos métodos locales si faltan y desactivar `ENVIO_FIJO`,
`ENTREGA_LOCAL`, `A_COORDINAR` y otros métodos antiguos. El checkout B1
oculta y rechaza métodos incompatibles; valida ciudad y provincia antes de
reservar stock. Configurar los métodos antes de publicar: de otro modo solo
estará disponible el retiro.

### Checklist de métodos de entrega

El seed actualizado crea los tres métodos aprobados en instalaciones nuevas.
Las bases existentes pueden conservar los métodos antiguos y carecer de los
dos métodos locales. Verificar su existencia real antes de crearlos; no
ejecutar el seed en producción para actualizar tarifas, porque no modifica
registros existentes.

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

La prueba aislada de B1 se completó sobre un replicaset MongoDB temporal en
`127.0.0.1`: `db:push` creó la colección y los índices esperados; una segunda
ejecución quedó sincronizada. Prisma leyó un registro `StoreSettings` anterior
sin campos fiscales y persistió los cinco campos nuevos sin alterar su email
preexistente. No se observaron operaciones destructivas. La instancia de
prueba se detuvo y eliminó; esta comprobación no sustituye la revisión del
plan de sincronización en el entorno de publicación.

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

Antes de publicar, confirmar responsable, suplente y guardia de revisión.
Ambos usarán cuentas administrativas individuales y el rol
`WITHDRAWAL_OPERATOR`, sin acceso directo a Atlas. Un administrador autorizado
ejecutará `npm run db:sync:withdrawal-permissions` después de sincronizar el
esquema y asignará el rol en `/admin/administradores`. No ejecutar el seed
completo para actualizar una instalación existente. El rol concede solamente
`admin.access`, `withdrawals.read` y `withdrawals.write`; no concede lectura
de pedidos ni capacidad de reembolso.

La sección `/admin/arrepentimientos` muestra contadores, filtros, búsqueda
exacta por código ARR completo o número de pedido y prioridad para no resueltas,
de más antiguas a más recientes. El detalle muestra contacto e historial.
No hay avisos automáticos. Procedimiento mínimo:

1. Revisar pendientes y en gestión al menos dos veces al día, incluyendo
   domingos, feriados y días sin atención comercial. Confirmar por escrito
   quién cubre cada revisión y su reemplazo; el contador requiere abrir o
   refrescar la página. La antigüedad usa tiempo calendario, no días hábiles.
2. Abrir la solicitud y registrar una actuación al comenzar la gestión. Verificar
   identidad y compra por email o WhatsApp; solicitar número de pedido solo
   cuando sea necesario para localizarla. La falta de número no anula la
   recepción.
3. Contactar al consumidor, coordinar devolución y conservar constancia de
   fechas, comunicaciones y decisión. Para pagos Mercado Pago, comprobar si
   ya hubo reembolso y seguir el procedimiento seguro existente.
4. Registrar la resolución obligatoria y referencia de la devolución ya
   efectuada o nota de crédito cuando corresponda. No incluir documentos de
   identidad, datos bancarios, credenciales ni secretos. Las actuaciones
   conservan operador y fecha y no se editan ni borran desde la interfaz.
   Resolver no modifica pedidos, stock, pagos ni reembolsos.

Transiciones: PENDING permite actuaciones sin cambio, IN_PROGRESS o RESOLVED;
IN_PROGRESS permite actuaciones o RESOLVED. RESOLVED es final. La versión
impide sobrescrituras: ante conflicto, recargar y revisar el historial.
Solicitudes antiguas sin estado o versión se interpretan como PENDING y 0.
Cambios, actuaciones y AuditLog se guardan atómicamente; AuditLog contiene
solo identificadores, estados y versión, sin copiar el contenido personal.

Validación local de la gestión: diez tests dirigidos aprobados, typecheck,
build y Prisma validate. En MongoDB temporal independiente se comprobaron
db:push, compatibilidad de registros antiguos, búsqueda/filtros/contadores,
concurrencia y rollback de estado/actuación ante fallo provocado en AuditLog.
La sincronización repetida conservó exactamente los tres permisos del rol.
En navegador se verificaron acceso anónimo denegado, cuenta operativa limitada,
actuaciones, cierre y revisión de escritorio/celular. No se usó Atlas ni VPS.
La prueba no sustituye la asignación real de cuentas y confirmación de guardia.

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

No implementarlo ni anunciarlo como disponible en B1. En ese futuro flujo,
los 2 días hábiles de preparación comenzarán desde la confirmación del pedido.
Se limitará a retiro presencial: pedido sin pago online, reserva segura, aviso
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
