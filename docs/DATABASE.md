# Base de datos

## Convenciones

- MongoDB Atlas es la única fuente de verdad persistente; Prisma gestiona el schema
  y el acceso a las colecciones.
- UUID `String` para claves primarias expuestas, mapeadas a `_id`. Fechas en UTC.
- Importes como `bigint` en centavos (`priceInCents`). El código usa `bigint`.
- Email y slugs se normalizan a minúsculas; SKU se normaliza a mayúsculas antes de
  persistir. Los casos de uso vuelven a validar estos formatos en servidor.
- Índices únicos y transacciones MongoDB complementan las invariantes de aplicación.
- Índices compuestos siguen patrones reales de consulta; no se indexa cada campo.

## Modelo implementado hasta Fase 7

### Identidad y autorización

- `User`: identidad compartida, email único normalizado,
  contraseña hasheada, estado y último acceso.
- `Role`, `Permission`, `UserRole`, `RolePermission`: RBAC normalizado. Los códigos
  son estables y únicos.
- `Session`: token opaco hasheado, expiración, metadatos mínimos y revocación.
- `PasswordResetToken`: token de un solo uso, hasheado y con expiración.
- `AuditLog`: actor opcional, acción, entidad, metadatos e IP.

La autenticación administrativa y cliente usa cookies distintas. Las sesiones
comparten la tabla normalizada, pero cada lector valida además el perfil requerido.

### Clientes

- `Customer`: perfil comercial 1:1 con `User`; teléfono, documento opcional,
  estado y timestamps. Nombre y email viven en `User` para no duplicarlos.
- `CustomerAddress`: destinatario y dirección argentina estructurada. Todas las
  consultas y mutaciones se restringen por `customerId`.
- `CustomerNote`: nota administrativa privada con cliente, autor y fecha; no se
  expone en DTOs públicos.

Un índice único parcial mantiene una sola dirección predeterminada por cliente.
La primera dirección se vuelve predeterminada y, al eliminarla, la operación
selecciona otra en la misma transacción. El email queda inmutable en esta fase.

### Catálogo

- `Product`: contenido común, slug único, estado, destacado, SEO y publicación.
- `ProductVariant`: unidad vendible. Contiene SKU único y normalizado (`A-Z`,
  números, `.`, `_`, `-`), atributos JSON, precios, estado y marca de variante por
  defecto.
- La fragancia se conserva en los atributos de la variante como `fragancia`
  (nombre visible) y `fraganciaKey`; esta última también se proyecta en un campo
  indexable para filtrar sin depender de JSON path, no soportado por Prisma MongoDB.
- `ProductImage`: varias imágenes ordenadas y con texto alternativo.
- `Category`: árbol opcional por `parentId`, slug único y orden.
- `ProductCategory`: relación N:M explícita para permitir orden y metadatos futuros.

Todo producto creado por la aplicación debe tener exactamente una variante por
defecto. MongoDB impide más de una mediante un índice único parcial. La
eliminación física de una variante con referencias históricas no estará permitida.
El caso de uso exige además que esa variante sea activa. Productos operativos se
retiran del catálogo mediante `INACTIVE` o `ARCHIVED`, no por borrado físico.

La jerarquía de categorías se protege en una transacción MongoDB mediante un lock
documental y un recorrido iterativo de ancestros. La relación usa `NoAction`: las
categorías se desactivan y no se eliminan físicamente desde la administración. La
imagen principal es la primera por `sortOrder`; los binarios viven fuera de
MongoDB. Un producto admite hasta 30 referencias de imagen en total.

### Inventario

- `Inventory`: una fila por variante, existencias físicas, reservadas, mínimo,
  versión para concurrencia optimista y timestamps de creación/actualización.
- `InventoryMovement`: delta firmado, stock anterior/posterior, tipo, motivo,
  referencia y administrador.

Invariantes:

- `stockOnHand >= 0`, `stockReserved >= 0`, `minimumStock >= 0`.
- `stockReserved <= stockOnHand` mientras no exista backorder.
- `stockAfter = stockBefore + quantity`.
- venta, salida y reserva nunca pueden dejar stock negativo.
- ningún cambio válido actualiza solo `Inventory`: también inserta movimiento en la
  misma transacción.

### Carrito

- `Cart`: carrito anónimo identificado por `guestTokenHash` SHA-256 o carrito
  autenticado identificado por `customerId`, estado, expiración, versión y
  timestamps UTC.
- `CartItem`: relación entre carrito y variante, cantidad y precio observado en
  centavos. `unique(cartId, variantId)` evita líneas duplicadas.

El precio observado no es una cotización ni una fuente autoritativa: cada lectura
y mutación obtiene el precio efectivo actual de `ProductVariant`. La cantidad se
limita entre 1 y 999 en dominio/aplicación. Las relaciones Prisma preservan las
acciones referenciales al operar mediante el cliente; las eliminaciones críticas
se coordinan dentro de transacciones.

Los carritos expiran 30 días después de la última mutación por defecto. El índice
`(status, expiresAt)` prepara una tarea futura de limpieza; esta fase no ejecuta
purga automática. El token crudo nunca se persiste y el UUID interno nunca se usa
como credencial pública. La aplicación exige exactamente un propietario (XOR). Un
índice único parcial impide dos carritos `ACTIVE` del mismo cliente. Durante una
adopción se elimina el token invitado; durante un merge el origen queda
`ABANDONED` y el destino conserva las líneas consolidadas.

### Pedidos

- `Order`: UUID interno, número público secuencial desde 10001, carrito único,
  cliente opcional o hash de acceso invitado (XOR), clave de checkout hasheada,
  comprador/dirección/método snapshot, estado, importes y vencimiento UTC.
- `OrderItem`: referencia opcional a variante más snapshot obligatorio de nombre,
  SKU, variante, precio unitario, cantidad y subtotal exacto.
- `OrderStatusHistory`: estado anterior/nuevo, actor, motivo y fecha. Índices por
  pedido/fecha y estado/fecha.
- `OrderNote`: contenido interno, pedido, administrador autor y fecha. No forma
  parte de consultas públicas; su contenido no se copia a snapshots del cliente.

El número público se obtiene de un documento contador transaccional y comienza en
10001, porque MongoDB no soporta `autoincrement()`. La máquina de estados comienza
en `PENDING_PAYMENT` y contempla `PAID`,
`PREPARING`, `READY_TO_SHIP`, `SHIPPED`, `DELIVERED`, `CANCELLED`,
`PAYMENT_REJECTED`, `REFUNDED` y `PARTIALLY_REFUNDED`. Fase 6 permite únicamente
transiciones operativas explícitas y cancelación pendiente; `PAID` y estados de
pago/reembolso quedan reservados a una integración futura.

`checkoutKeyHash` y `cartId` únicos aportan idempotencia. La aplicación verifica
`total = itemsSubtotal + shipping - discount`; descuento es cero en esta fase.
Los pedidos invitados exigen hash de acceso y los de cliente no lo guardan.

### Reservas

La creación aumenta `Inventory.stockReserved` con control de versión sin alterar
`stockOnHand`. No se inserta `InventoryMovement` porque los movimientos representan
existencias físicas. Al vencer, liberación y transición a `CANCELLED` son atómicas
e idempotentes mediante `reservationReleasedAt`.

### Entrega implementada

- `ShippingMethod`: código único normalizado, nombre, descripción, tipo, costo,
  política de dirección, compra mínima, umbral gratuito, estado y orden.
- `PICKUP`, `FLAT_RATE`, `LOCAL_DELIVERY` y `TO_COORDINATE` están disponibles.
- El pedido conserva un snapshot; editar o desactivar el método no altera historia.

## Modelo objetivo por fases

### Configuración de tienda implementada en Fase 10

`StoreSettings` conserva una única fila (`id = 1`) con la identidad comercial,
los datos públicos de contacto, redes sociales y una descripción breve. El ID fijo
`1`, el repositorio y el seed idempotente preservan el carácter single-store.

### Pagos

- `Payment`: pedido, gateway, referencia externa, estado, importe, moneda e
  idempotency key. Restricciones únicas por gateway/referencia e idempotency key.
- `PaymentEvent`: evento recibido con `providerEventId` único, hash/payload
  sanitizado, estado de procesamiento, intentos y error. Es la bandeja de entrada
  idempotente.

Un pedido puede tener varios intentos de pago, pero el total aprobado/reembolsado
se deriva de pagos, no de un único campo mutable sin historial.

### Evolución de envíos

- `ShippingMethod`: tipo, nombre, descripción, límites de compra, tarifa, umbral de
  gratuidad y estado.
- `ShippingZone`: definición geográfica normalizada y prioridad.
- tablas de unión para métodos/zonas y códigos postales o rangos.
- `Shipment`: pedido, método y dirección snapshot, estado, costo snapshot,
  tracking y timestamps. Un pedido puede evolucionar a múltiples despachos.

### Promociones y contenido

- `Coupon`: código único normalizado, vigencia, límites de uso y estado.
- `Discount`: tipo/valor, prioridad, combinabilidad y condiciones.
- uniones explícitas con producto/categoría; los usos de cupón se registran por
  pedido/cliente para límites e idempotencia.
- `StoreSettings`: fila única versionada lógicamente para identidad, contacto, SEO
  y preferencias públicas; secretos de proveedores nunca se guardan aquí.
- `Banner` y `Page`: contenido, estado, posición, vigencia y SEO.

## Índices principales previstos

- catálogo: producto por `(status, publishedAt)`, `(status, updatedAt)`, destacado,
  categoría/producto, SKU y slug únicos; Atlas Search se evaluará solo si el volumen
  lo justifica.
- inventario: variante única, movimientos por `(inventoryId, createdAt)` y
  `(referenceType, referenceId)`. El predicado calculado de bajo stock se evalúa
  en aplicación porque MongoDB no admite ese índice relacional parcial.
- pedidos: número único, `(customerId, createdAt)`, `(status, createdAt)` y
  `(shippingMethodId, createdAt)`.
- notas de pedido: `(orderId, createdAt)` y `(actorUserId, createdAt)`.
- notas de cliente: `(customerId, createdAt)` y `(actorUserId, createdAt)`.
- pagos/eventos: referencias externas e idempotencia únicas.
- auditoría: `(actorUserId, createdAt)` y `(entityType, entityId, createdAt)`.

## Sincronización y seed

- MongoDB no utiliza Prisma Migrate ni migraciones SQL. Desarrollo y despliegue
  ejecutan `npm run db:push`.
- `db:push` sincroniza el schema Prisma y luego crea de forma idempotente los
  índices parciales que Prisma Schema no puede expresar.
- El seed crea permisos, rol base, catálogo, inventario, métodos de entrega y
  `StoreSettings` de forma idempotente. Si el administrador ya existe, no reemplaza
  su contraseña ni reactiva su cuenta.
- El administrador inicial solo se crea si se proveen `SEED_ADMIN_EMAIL` y
  `SEED_ADMIN_PASSWORD`; nunca existe una credencial predeterminada en Git.
- `npm run db:verify` comprueba conexión, versión de índices e invariantes de datos
  sin exigir cantidades exactas, por lo que sigue siendo válido después de operar
  el catálogo.
