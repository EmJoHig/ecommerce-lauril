# Base de datos

## Convenciones

- PostgreSQL es la fuente de verdad; Prisma gestiona esquema y migraciones.
- UUID para claves primarias expuestas. Fechas `timestamptz` en UTC.
- Importes como `bigint` en centavos (`priceInCents`). El código usa `bigint`.
- Email y slugs se normalizan a minúsculas; SKU se normaliza a mayúsculas antes de
  persistir. PostgreSQL también rechaza valores fuera de ese formato.
- Restricciones SQL protegen invariantes además de la validación de aplicación.
- Índices compuestos siguen patrones reales de consulta; no se indexa cada campo.

## Modelo implementado en Fase 1

### Identidad y autorización

- `User`: identidad administrativa/cliente futura, email único normalizado,
  contraseña hasheada, estado y último acceso.
- `Role`, `Permission`, `UserRole`, `RolePermission`: RBAC normalizado. Los códigos
  son estables y únicos.
- `Session`: token opaco hasheado, expiración, metadatos mínimos y revocación.
- `PasswordResetToken`: token de un solo uso, hasheado y con expiración.
- `AuditLog`: actor opcional, acción, entidad, metadatos e IP.

### Catálogo

- `Product`: contenido común, slug único, estado, destacado, SEO y publicación.
- `ProductVariant`: unidad vendible. Contiene SKU único y normalizado (`A-Z`,
  números, `.`, `_`, `-`), atributos JSON, precios, estado y marca de variante por
  defecto.
- `ProductImage`: varias imágenes ordenadas y con texto alternativo.
- `Category`: árbol opcional por `parentId`, slug único y orden.
- `ProductCategory`: relación N:M explícita para permitir orden y metadatos futuros.

Todo producto creado por la aplicación debe tener exactamente una variante por
defecto. PostgreSQL impide más de una mediante un índice único parcial. La
eliminación física de una variante con referencias históricas no estará permitida.

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

## Modelo objetivo por fases

### Clientes y carritos

- `Customer` enlaza 1:1 con `User` y contiene nombre, apellido, teléfono y documento
  opcional. Documento no es globalmente obligatorio ni necesariamente único.
- `CustomerAddress` pertenece al cliente, guarda destinatario y dirección
  estructurada. Una restricción/operación transaccional mantiene una sola dirección
  predeterminada por tipo.
- `Cart` tiene token de invitado hasheado o cliente, estado y expiración. Índices por
  cliente/estado y expiración permiten recuperar y purgar.
- `CartItem` referencia variante y cantidad; `unique(cartId, variantId)` evita
  duplicados. Los precios guardados son solo una vista; checkout recalcula.

### Pedidos

- `Order`: número público único, cliente opcional, email/teléfono snapshot, estado,
  moneda, subtotal, descuento, envío, impuestos y total en centavos, direcciones
  snapshot JSON y timestamps operativos.
- `OrderItem`: referencia opcional a variante más snapshot obligatorio de nombre,
  SKU, variante/atributos, precio unitario, cantidad y subtotal.
- `OrderStatusHistory`: estado anterior/nuevo, actor, motivo y fecha. Índices por
  pedido/fecha y estado/fecha.

La máquina de estados comienza con `CREATED`, `PENDING_PAYMENT`, `PAID`,
`PREPARING`, `READY_TO_SHIP`, `SHIPPED`, `DELIVERED`, `CANCELLED`,
`PAYMENT_REJECTED`, `REFUNDED` y `PARTIALLY_REFUNDED`. Solo el caso de uso puede
transicionar y registra historial en la misma transacción.

### Pagos

- `Payment`: pedido, gateway, referencia externa, estado, importe, moneda e
  idempotency key. Restricciones únicas por gateway/referencia e idempotency key.
- `PaymentEvent`: evento recibido con `providerEventId` único, hash/payload
  sanitizado, estado de procesamiento, intentos y error. Es la bandeja de entrada
  idempotente.

Un pedido puede tener varios intentos de pago, pero el total aprobado/reembolsado
se deriva de pagos, no de un único campo mutable sin historial.

### Envíos

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

- catálogo: producto por `(status, publishedAt)`, destacado, categoría/producto,
  SKU y slug únicos; búsqueda textual se evaluará con `pg_trgm` o `tsvector`.
- inventario: variante única, índice parcial para el predicado de bajo stock
  `stockOnHand - stockReserved <= minimumStock`, movimientos por `(inventoryId,
  createdAt)` y `(referenceType, referenceId)`.
- pedidos: número único, `(customerId, createdAt)`, `(status, createdAt)`.
- pagos/eventos: referencias externas e idempotencia únicas.
- auditoría: `(actorUserId, createdAt)` y `(entityType, entityId, createdAt)`.

## Migraciones y seed

- Desarrollo: `npm run db:migrate -- --name <cambio>`.
- Producción: `npm run db:migrate:deploy`.
- El seed crea permisos/rol base y catálogo demostrativo de forma idempotente. Si
  el administrador ya existe, no reemplaza su contraseña ni reactiva su cuenta.
- El administrador inicial solo se crea si se proveen `SEED_ADMIN_EMAIL` y
  `SEED_ADMIN_PASSWORD`; nunca existe una credencial predeterminada en Git.
