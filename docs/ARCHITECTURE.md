# Arquitectura

## Estilo

Monolito modular desplegable como una sola aplicación Next.js y una única base
MongoDB Atlas. Evita la latencia y operación de microservicios, mientras conserva
límites que permiten extraer un módulo solo si existe una necesidad comprobada.

```text
Browser
  -> Next.js presentation (pages, route handlers, server actions)
      -> application use cases
          -> domain rules and ports
              <- infrastructure adapters (Prisma, S3, email, Mercado Pago)
                  -> MongoDB Atlas / external providers
```

La composición de dependencias ocurre cerca de infraestructura. Las dependencias
de código apuntan hacia el dominio: un caso de uso conoce interfaces, no Prisma ni
SDKs. Un adaptador implementa esas interfaces.

## Módulos objetivo

- `auth`: identidad, sesiones, roles, permisos y recuperación de contraseña.
- `catalog`: productos, variantes, categorías, imágenes, atributos y SEO.
- `inventory`: existencias, reservas, movimientos y alertas de stock mínimo.
- `customers`: perfil y direcciones.
- `cart`: carrito invitado/autenticado, fusión y cálculo preliminar.
- `pricing`: dinero, promociones, cupones y cálculo autoritativo.
- `orders`: checkout, snapshots, máquina de estados e historial.
- `payments`: pagos, eventos, idempotencia y gateway Mercado Pago.
- `shipping`: cotización, métodos, zonas y despachos.
- `content`: configuración, páginas y banners.
- `reporting`: proyecciones y consultas de métricas.
- `audit`: bitácora administrativa.

Los módulos pueden consultar datos propios. Las operaciones que atraviesan varios
módulos se coordinan desde un caso de uso de aplicación y una transacción; no se
ocultan reglas de negocio en callbacks de UI.

## Estructura

```text
src/
  app/
    (store)/                 tienda pública
    (admin-auth)/            acceso administrativo
    (admin)/admin/           panel protegido
    api/health/              health check
  modules/
    <module>/
      domain/                entidades, value objects, reglas, puertos
      application/           casos de uso y DTOs
      infrastructure/        Prisma y proveedores externos
      presentation/          componentes y acciones propios del módulo
  shared/
    domain/                  Money, errores y tipos compartidos mínimos
    infrastructure/          cliente Prisma, configuración y logging
    presentation/            componentes visuales reutilizables
prisma/
  schema.prisma
  seed.ts
tests/
```

No todos los módulos necesitan las cuatro carpetas desde el primer día. Se crean
cuando existe código real, evitando esqueletos vacíos.

## Presentación

Se utiliza App Router y Server Components por defecto. Los Client Components se
reservan para interacción local. Server Actions y Route Handlers:

1. autentican y autorizan;
2. validan el DTO;
3. invocan un caso de uso;
4. transforman el resultado a una respuesta/redirección.

Nunca reciben como autoritativos precio, descuento, costo de envío, rol ni estado.
Las páginas dinámicas que consultan MongoDB Atlas se marcan explícitamente para no
conectar a la base durante el build.

## Datos y consistencia

- Prisma es un detalle de infraestructura. Los tipos Prisma no atraviesan el
  límite del módulo hacia componentes o reglas puras.
- Una transacción MongoDB crea el pedido, sus snapshots e historial, reserva
  `stockReserved` y convierte el carrito. La reserva no es movimiento físico.
- Se usa concurrencia optimista (`Inventory.version`) y actualizaciones
  condicionales para evitar sobreventa.
- Los eventos externos se persisten antes de producir efectos. Un identificador
  único del proveedor impide procesarlos dos veces.
- Los reportes complejos se implementan como consultas dedicadas; no fuerzan a las
  entidades transaccionales a convertirse en DTOs de dashboard.

## Errores, logs y observabilidad

El dominio usa errores tipados (`ValidationError`, `ConflictError`,
`NotFoundError`). Las Server Actions del catálogo traducen errores esperables a
mensajes de formulario y dejan los errores inesperados al borde central de Next.js.
El logger estructurado acepta contexto como `requestId`, módulo, acción y actor
cuando el llamador lo provee. No se registran contraseñas, tokens, cookies ni
payloads completos de pagos.

El endpoint `/api/health` comprueba proceso y, opcionalmente, conectividad mediante
un servicio de infraestructura; el Route Handler no accede a Prisma. En producción
se utilizan logs del proceso administrado por PM2 y health checks a través de
Nginx; la captura externa de errores permanece como evolución operativa.

## Autenticación

Sesiones opacas almacenadas en base. `AuthService` depende de `AuthRepository` y el
adaptador `PrismaAuthRepository` concentra las consultas y la transacción de login.
El navegador conserva un token aleatorio en
cookie `HttpOnly`, `Secure` en producción y `SameSite=Lax`; la base guarda solo su
hash SHA-256. Las contraseñas se almacenan con bcrypt y factor configurable. La
autorización consulta permisos efectivos de los roles.

La autorización administrativa se verifica server-side por permiso antes de cada
consulta o mutación. La cookie administrativa y la cookie de cliente son distintas;
ambas usan `Session`, pero el acceso cliente exige un `Customer` activo y el acceso
administrativo exige `admin.access`. Ningún perfil se deduce automáticamente del
otro.

## Clientes en Fase 4

`User` conserva la identidad compartida (email, hash de contraseña y nombre) y
`Customer` agrega el perfil comercial 1:1 (teléfono, documento y estado), evitando
duplicar datos. El módulo `customers` concentra registro, login público,
recuperación, perfil y direcciones mediante puertos propios; la presentación solo
valida DTOs, resuelve sesión e invoca casos de uso.

La recuperación invalida tokens anteriores, utiliza CSPRNG, persiste solo SHA-256,
permite un único uso y revoca todas las sesiones al cambiar la contraseña.
`EmailSender` desacopla la entrega: desarrollo devuelve un enlace de preview al
formulario y producción usa `ResendEmailSender` sin exponer el token.

Cada mutación de dirección deriva `customerId` de la sesión y consulta por
`(addressId, customerId)`. La dirección predeterminada se mantiene en una
transacción MongoDB y un índice parcial impide más de una por cliente.

## Imágenes

`ProductImage` guarda clave de objeto, URL pública/servida, texto alternativo y
orden; la primera imagen por `sortOrder` es la principal. `ObjectStorage` desacopla
el caso de uso del proveedor. `LocalObjectStorage` escribe por defecto en
`<process.cwd()>/public/uploads/catalog`, ruta ignorada por Git. La raíz física
puede configurarse con `LOCAL_UPLOAD_ROOT` sin alterar las URLs públicas
`/uploads/...`. `S3ObjectStorage`, compatible con Cloudflare R2, permanece
disponible para una activación futura mediante `OBJECT_STORAGE_DRIVER=s3`.

## Catálogo en Fase 2

Las páginas y Server Actions dependen de casos de uso de `catalog` e `inventory`;
no importan Prisma. `PrismaCatalogAdminRepository` concentra consultas y
transacciones. La creación de producto, variante predeterminada, inventario,
movimiento inicial y auditoría es atómica. Los ajustes de stock usan el caso de uso
de inventario, compuesto desde infraestructura, y registran movimiento y auditoría
en la misma transacción.

Las categorías serializan cambios jerárquicos con un lock documental transaccional y
validan ancestros mediante consultas Prisma iterativas, evitando ciclos incluso ante
escrituras concurrentes. Productos y variantes se desactivan o archivan; no se
eliminan físicamente desde la administración.

La importación administrativa de catálogo acepta `.xlsx`, genera una plantilla,
valida y previsualiza antes de confirmar. La persistencia crea o actualiza por SKU
dentro de una única transacción, sincroniza las categorías comerciales, conserva
las invariantes y movimientos de inventario y registra auditoría. `fragranceKey`
proyecta la fragancia normalizada en un campo indexable para el filtro público.

## Carrito en Fase 3

`cart` mantiene la misma dirección de dependencias: presentación invoca
`CartService`, el caso de uso usa `CartRepository`/`CartTransaction` y
`PrismaCartRepository` implementa el puerto. Ningún componente ni Server Action
consulta Prisma directamente.

El propietario anónimo se demuestra con un token CSPRNG de 256 bits almacenado en
cookie `HttpOnly`, `SameSite=Lax` y `Secure` en producción. MongoDB conserva
solo SHA-256 del token; el UUID interno del carrito nunca se envía al navegador.
Cada mutación obtiene el carrito por ese hash y restringe artículos al carrito
encontrado, evitando IDOR por sustitución de IDs.

Los casos de uso disponibles son lectura, agregar, cambiar cantidad, eliminar y
vaciar. Las mutaciones usan transacciones MongoDB para que dos pestañas no
creen líneas duplicadas ni pierdan actualizaciones silenciosamente. Un conflicto
concurrente se devuelve como error recuperable para reintentar.

El carrito vuelve a leer `Product`, `ProductVariant` e `Inventory` en cada
operación y lectura. Precio efectivo, subtotal de línea, subtotal general y
cantidad total se calculan en dominio con enteros/bigint. El precio observado en
`CartItem` sirve únicamente para avisar un cambio; nunca es autoritativo. El stock
disponible usa la regla de `inventory`; no se reserva, modifica ni genera
`InventoryMovement` en esta fase.

## Carrito autenticado y fusión en Fase 4

`Cart` tiene exactamente un propietario: hash de token invitado o `customerId`.
Un índice parcial MongoDB garantiza un solo carrito `ACTIVE` por cliente. Las acciones resuelven
primero la sesión cliente y nunca aceptan `customerId` desde el navegador.

En registro/login, el merge se ejecuta en una transacción MongoDB con hasta
tres reintentos ante conflicto. Para cada variante se suman las cantidades, se
vuelve a leer producto, variante, precio e inventario y se limita a
`min(suma, stockAvailable, 999)`. Las líneas inactivas o sin stock se omiten y el
snapshot se actualiza al precio efectivo. El origen invitado se vacía y marca
`ABANDONED`; si se adopta directamente, se elimina su hash invitado. La UI informa
cantidades ajustadas u omitidas.

La fusión no reserva stock ni genera `InventoryMovement`. El carrito cliente se
resuelve por sesión y permanece en MongoDB después de logout, reinicio o una
sesión posterior.

## Checkout, envíos y pedidos en Fase 5

`CheckoutService` coordina `orders`, `cart`, `shipping`, `customers` e `inventory`
a través de puertos. La presentación entrega identidad, clave de idempotencia,
método y datos de comprador/dirección; el caso de uso vuelve a leer carrito,
producto, variante, precio e inventario dentro de una transacción MongoDB.
`PrismaOrderRepository` concentra las consultas y escrituras Prisma.

`CustomShippingProvider` cotiza `ShippingMethod` activos. `PICKUP` y
`TO_COORDINATE` no solicitan dirección; `LOCAL_DELIVERY` siempre la exige y
`FLAT_RATE` permite configurarlo. Compra mínima y gratuidad se evalúan en dominio.
El nombre, tipo, política y costo elegidos se copian al pedido.

La confirmación usa una clave CSPRNG cuyo SHA-256 es único. `cartId` también es
único en `Order`: el mismo submit devuelve el pedido existente y claves distintas
no convierten dos veces el carrito. Se incrementa `Inventory.stockReserved` con
versión optimista; `stockOnHand` y `InventoryMovement` no cambian. El carrito queda
`CONVERTED` en la misma transacción.

Todo pedido nace `PENDING_PAYMENT`, con historial y vencimiento configurable por
`ORDER_RESERVATION_MINUTES` (15 por defecto). `expirePendingOrders` libera cada
reserva una sola vez, marca `CANCELLED` y agrega historial.

### Job operativo de expiración

La lógica de expiración está implementada y el comando
`npm run db:expire-orders` continúa disponible para ejecución manual en el
artefacto de la aplicación con `MONGODB_URI` configurada. Actualmente no existe
cron, systemd timer ni otro scheduler activo. La automatización, incluida la
elección del scheduler, la frecuencia UTC, la prevención de solapamientos y la
observabilidad mínima, quedó postergada como pendiente operativo no bloqueante y
se implementará únicamente cuando el responsable del proyecto decida iniciarla.
Esto no bloquea Fase 12B, Fase 12C ni fases posteriores.

El comando no es interactivo, procesa hasta 100 pedidos vencidos por ejecución y
termina. No requiere endpoint HTTP, proceso web, cola ni worker permanente.

En éxito, incluso si no hay pedidos para expirar, devuelve código `0` y una línea
JSON con `job`, `status` y `expired`. Ante un fallo devuelve código `1` y un JSON
mínimo sin credenciales, tokens, datos personales ni detalles internos del error.
Las ejecuciones repetidas son seguras: cada pedido vuelve a validar estado y
vencimiento, y la liberación de `stockReserved`, cancelación e historial ocurren
en una transacción MongoDB con compare-and-set de la versión de inventario.

Los clientes acceden sólo a pedidos vinculados a su sesión. Un invitado recibe una
cookie `HttpOnly` restringida a `/pedido/<número>` con el token opaco del carrito;
MongoDB conserva únicamente su hash. El número humano no autoriza por sí solo.

## Operación administrativa de pedidos en Fase 6

`OrderAdminService` concentra filtros, validación de comandos, notas y decisiones
de transición; depende de `OrderAdminRepository`. `PrismaOrderAdminRepository`
implementa consultas, compare-and-set, historial, auditoría y liberación de reserva
en transacciones MongoDB. Páginas y Server Actions no importan Prisma.

La máquina de estados está en dominio y distingue fuente `ADMIN`, `SYSTEM` o
`PAYMENT`. Administración permite `PENDING_PAYMENT -> CANCELLED`, y para pedidos
ya pagados `PAID -> PREPARING -> READY_TO_SHIP -> SHIPPED -> DELIVERED`. `PICKUP`
omite despacho y pasa de listo a entregado. `PAID`, rechazos y reembolsos no se
asignan manualmente; la integración de pagos de F14 confirma sus estados mediante
consulta autoritativa del proveedor.

Cancelar un pendiente libera `stockReserved` una sola vez sin modificar
`stockOnHand` ni crear `InventoryMovement`. La transición, el historial con actor
y `AuditLog` se escriben atómicamente. `OrderNote` es información operativa interna
y nunca forma parte del DTO público del pedido.

## Pagos en Fase 14

`payments` introduce `PaymentAttempt` como historial 1:N del pedido y
`PaymentEvent` como inbox idempotente. Un intento conserva importe y moneda del
pedido, número secuencial por pedido, una clave de idempotencia local propia y el
snapshot mínimo devuelto por el proveedor. Reintentos técnicos del mismo intento
reutilizan su clave persistida; un nuevo intento recibe otro número y otra clave.

`PaymentGateway` expone crear un checkout externo, solicitar refunds y consultar el estado
autoritativo de su recurso, usando tipos propios sin Prisma ni tipos de Mercado
Pago. La integración implementada es Checkout Pro mediante Mercado Pago Orders API
(`POST /v1/orders`), no la API clásica de Preferences. F14B incorpora
`MercadoPagoOrdersGateway` con `fetch` nativo, timeout, errores normalizados y
consulta autoritativa mediante `GET /v1/orders/{id}`. El token queda exclusivamente
en infraestructura server-side.

`StartPaymentCheckout` vuelve a leer el pedido y exige estado `PENDING_PAYMENT`,
reserva vigente y no liberada. Adquiere o reutiliza el intento activo, envía su
clave persistida en `X-Idempotency-Key` y guarda el recurso, checkout URL y estado
original del proveedor. Si el recurso ya tiene checkout URL, no repite el POST.
Un índice único parcial por pedido para estados `CREATED`/`PENDING`, combinado con
`unique(orderId, attemptNumber)` y recuperación de colisiones, evita dos intentos
activos aun entre procesos distintos.

La Server Action vuelve a comprobar ownership customer/guest, aplica rate limit y
solo redirige a una URL HTTPS obtenida server-side. `MERCADO_PAGO_ENABLED` vale
`false` por defecto; sin flag y token no se muestra el botón ni se compone el
gateway. Los parámetros `payment_return` muestran únicamente un mensaje neutro y
no cambian estado local alguno.

Los eventos se deduplican por `provider + providerEventId`. `failed` marca solo el
`PaymentAttempt` como `REJECTED` y `canceled` como `CANCELLED`; el pedido permanece
`PENDING_PAYMENT` para permitir otro intento mientras la reserva continúe viva.
`Order.PAYMENT_REJECTED` no representa el rechazo de un intento individual y la
integración no transiciona el pedido a ese estado.

F14C incorpora `POST /api/payments/mercado-pago/webhook`. La autenticación pública
es la firma HMAC-SHA256 de Mercado Pago: el manifest usa exclusivamente `data.id`
del query con casing exacto como validación primaria, `x-request-id` y `ts`; la
comparación del hash usa `timingSafeEqual`. Sólo si falla la firma exacta y el ID
cumple `^ORDTST[A-Z0-9]+$`, admite el HMAC lowercase observado en sandbox, con el
mismo secreto, request ID y timestamp. El ID original se conserva para consultar
y procesar; Orders productivas exigen casing exacto.
El body se limita y valida recién después de autenticar, y su
`data.id` debe coincidir con el recurso firmado. El secreto es server-side,
opcional con la feature apagada y nunca se persiste ni registra.

El webhook crea o recupera `PaymentEvent` en `RECEIVED` antes de cualquier GET.
Checkout Pro Orders puede omitir el `id` top-level del body: `providerEventId`
usa ese ID si existe o `request:<x-request-id>` si falta. El fallback usa el
request ID autenticado por HMAC y se limita a 255 caracteres, incluido el prefijo.
`data.id` identifica `providerResourceId`, no una notificación. La misma request
ID deduplica el evento; con otra request ID, las defensas transaccionales, de
estado y del índice único `SALE` siguen impidiendo efectos físicos duplicados.
Los eventos finales se deduplican sin consultar nuevamente; `RECEIVED` y `FAILED`
pueden reintentarse. Tras asociar exclusivamente por proveedor y recurso, el caso
de uso consulta `GET /v1/orders/{id}`. Solo `processed/accredited`, con referencia
externa, ARS, total y total pagado exactos, puede aprobar automáticamente.

`PrismaPaymentConfirmationUnitOfWork` relee evento, intento, pedido, items e
inventarios. Una sola transacción consume simultáneamente `stockOnHand` y
`stockReserved` mediante CAS de `Inventory.version`, inserta `SALE`, cambia el
pedido `PENDING_PAYMENT -> PAID` por fuente `PAYMENT`, agrega historial, aprueba
el intento con timestamp local de confirmación y finaliza el evento. El timestamp
`approvedAt` representa la confirmación local, no un instante inventado del
proveedor. El índice parcial único de venta por inventario/pedido, la transacción
y los CAS protegen el exactly-once entre procesos.

La expiración y el webhook compiten sobre el mismo pedido/reserva: quien confirma
primero invalida la escritura condicional del otro. F14D agrega `PaymentRefund` y
`PaymentGateway.refundOrder`. Cada operación posee su UUID de idempotencia
persistido: los reintentos técnicos conservan la misma clave, mientras un refund
nuevo obtiene otra. El total usa `POST /v1/orders/{id}/refund` sin body; el parcial
envía una transacción inequívoca y un importe decimal derivado de centavos.

El GET autoritativo suma exactamente `transactions.refunds[].amount`. Confirmar
refunds transiciona `PAID -> PARTIALLY_REFUNDED/REFUNDED` o
`PARTIALLY_REFUNDED -> REFUNDED`, sin movimientos ni cambios de inventario.
Refund no equivale a devolución física de mercadería y nunca repone stock.

Una acreditación posterior a cancelación, liberación o pérdida de reserva no
crea venta ni reserva: prepara/reutiliza un refund total y espera confirmación
autoritaria. Al confirmarse, el intento queda `REFUNDED` pero el pedido continúa
`CANCELLED`. Fallos transitorios reintentan la misma operación; incoherencias
permanentes quedan `REQUIRES_REVIEW` y generan un log estructurado.

## Backoffice consolidado en Fase 7

El layout protegido compone navegación responsive y consciente de permisos. Las
páginas autentican con `requireAdmin`, invocan servicios y renderizan DTOs; no
importan Prisma. Búsqueda, fechas, paginación y límites se normalizan con
utilidades compartidas de aplicación.

`CustomerAdminService`, `InventoryAdminService`, `AdminAccessService`,
`AuditService` y `AdminOverviewService` exponen consultas y comandos específicos.
Sus adaptadores Prisma concentran filtros, transacciones y auditoría. Las notas de
cliente son privadas; editar un perfil conserva email y contraseña, y
deshabilitarlo bloquea el login sin borrar identidad ni historia comercial.

Administradores y roles reutilizan el RBAC existente. Las mutaciones impiden la
auto-deshabilitación y dejar el sistema sin un administrador activo. Auditoría es
de solo lectura y elimina claves sensibles de metadatos antes de enviarlos a UI.

## Despliegue

La aplicación está desplegada en el VPS definitivo. Next.js se ejecuta bajo PM2 y
Nginx actúa como reverse proxy para el dominio con HTTPS. El deploy actual se
realiza desde Git; variables y secretos se mantienen fuera del repositorio en el
entorno productivo. `npm run db:push` sincroniza schema e índices de forma
controlada y `npm run db:verify` valida la persistencia.

Producción utiliza MongoDB Atlas, ObjectStorage local y Resend. El adaptador
S3-compatible permanece disponible pero inactivo. `npm run db:expire-orders`
puede ejecutarse manualmente, pero no hay scheduler activo; su automatización es
un pendiente operativo no bloqueante. Desarrollo se conecta directamente a Atlas
y no necesita PostgreSQL ni Docker para la base.

## Decisiones explícitas

- App Router en lugar de Pages Router.
- Monolito modular, no microservicios ni multi-tenancy preventivo.
- Identificadores UUID y nombres de campos/colecciones `snake_case` mediante
  `@map`/`@@map`.
- Importes enteros en unidad mínima, nunca `number` decimal para cálculos.
- SKU normalizado en mayúsculas y slug normalizado en minúsculas, con validación
  tanto en dominio como mediante índices únicos MongoDB.
- Stock por variante con una variante por defecto obligatoria a nivel de caso de
  uso; no hay stock duplicado en `Product`.
- Estados y archivo lógico para registros históricos.
- Contratos propios para pagos, envíos, objetos y email.
