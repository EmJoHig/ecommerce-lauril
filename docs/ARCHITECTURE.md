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
              <- infrastructure adapters (Prisma, Mercado Pago, S3, email)
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
se usarán logs de stdout/stderr, health checks de Render y un servicio externo de
captura de errores.

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
formulario y producción no expone el token mientras no exista proveedor real.

Cada mutación de dirección deriva `customerId` de la sesión y consulta por
`(addressId, customerId)`. La dirección predeterminada se mantiene en una
transacción MongoDB y un índice parcial impide más de una por cliente.

## Imágenes

`ProductImage` guarda clave de objeto, URL pública/servida, texto alternativo y
orden; la primera imagen por `sortOrder` es la principal. `ObjectStorage` desacopla
el caso de uso del proveedor. En desarrollo, `LocalObjectStorage` escribe en
`public/uploads/catalog`, ruta ignorada por Git. Producción deberá usar un adaptador
S3 compatible: los binarios no se guardarán en el disco efímero de Render.

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

Un scheduler externo debe ejecutar periódicamente `npm run db:expire-orders` en
el artefacto de la aplicación con `MONGODB_URI` configurada. El comando no es
interactivo, procesa hasta 100 pedidos vencidos por ejecución y termina; conviene
programarlo con una frecuencia menor al tiempo de reserva y evitar ejecuciones
solapadas. No requiere endpoint HTTP, proceso web, cola ni worker permanente.

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
asignan manualmente; quedan reservados a integraciones futuras.

Cancelar un pendiente libera `stockReserved` una sola vez sin modificar
`stockOnHand` ni crear `InventoryMovement`. La transición, el historial con actor
y `AuditLog` se escriben atómicamente. `OrderNote` es información operativa interna
y nunca forma parte del DTO público del pedido.

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

La aplicación puede ejecutarse con el runtime Node de Render y MongoDB Atlas.
`npm run db:push` sincroniza el schema y los índices en un paso operativo
controlado; la aplicación se inicia con `npm run start`. Desarrollo se conecta
directamente a Atlas y no necesita PostgreSQL ni Docker para la base.

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
