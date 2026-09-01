# Base de datos

## Convenciones

- PostgreSQL es la fuente de verdad; Prisma gestiona esquema y migraciones.
- UUID para claves primarias expuestas. Fechas `timestamptz` en UTC.
- Importes como `bigint` en centavos (`priceInCents`). El código usa `bigint`.
- Email y slugs se normalizan a minúsculas; SKU se normaliza a mayúsculas antes de
  persistir. PostgreSQL también rechaza valores fuera de ese formato.
- Restricciones SQL protegen invariantes además de la validación de aplicación.
- Índices compuestos siguen patrones reales de consulta; no se indexa cada campo.

## Modelo implementado hasta Fase 5

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

Un índice único parcial mantiene una sola dirección predeterminada por cliente.
La primera dirección se vuelve predeterminada y, al eliminarla, la operación
selecciona otra en la misma transacción. El email queda inmutable en esta fase.

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
El caso de uso exige además que esa variante sea activa. Productos operativos se
retiran del catálogo mediante `INACTIVE` o `ARCHIVED`, no por borrado físico.

La jerarquía de categorías se protege en una transacción serializable con advisory
lock y recorrido recursivo de ancestros. `parentId` usa `ON DELETE RESTRICT`: las
categorías se desactivan y no se eliminan físicamente desde la administración. La
imagen principal es la primera por `sortOrder`; los binarios viven fuera de
PostgreSQL. Un producto admite hasta 30 referencias de imagen en total.

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
limita entre 1 y 999 tanto en dominio como mediante constraint SQL. Las claves
foráneas impiden eliminar una variante referenciada y eliminan los items al
eliminar físicamente un carrito durante una futura limpieza.

Los carritos expiran 30 días después de la última mutación por defecto. El índice
`(status, expiresAt)` prepara una tarea futura de limpieza; esta fase no ejecuta
purga automática. El token crudo nunca se persiste y el UUID interno nunca se usa
como credencial pública. Una constraint XOR exige exactamente un propietario. Un
índice único parcial impide dos carritos `ACTIVE` del mismo cliente. Durante una
adopción se elimina el token invitado; durante un merge el origen queda
`ABANDONED` y el destino conserva las líneas consolidadas.

### Pedidos

- `Order`: UUID interno, número `bigserial` público desde 10001, carrito único,
  cliente opcional o hash de acceso invitado (XOR), clave de checkout hasheada,
  comprador/dirección/método snapshot, estado, importes y vencimiento UTC.
- `OrderItem`: referencia opcional a variante más snapshot obligatorio de nombre,
  SKU, variante, precio unitario, cantidad y subtotal exacto.
- `OrderStatusHistory`: estado anterior/nuevo, actor, motivo y fecha. Índices por
  pedido/fecha y estado/fecha.

La máquina de estados comienza en `PENDING_PAYMENT` y contempla `PAID`,
`PREPARING`, `READY_TO_SHIP`, `SHIPPED`, `DELIVERED`, `CANCELLED`,
`PAYMENT_REJECTED`, `REFUNDED` y `PARTIALLY_REFUNDED`. Fase 5 sólo crea el primer
estado y cancela por expiración; pagos incorporará transiciones posteriores.

`checkoutKeyHash` y `cartId` únicos aportan idempotencia. Una constraint verifica
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
  categoría/producto, SKU y slug únicos; búsqueda textual se evaluará con
  `pg_trgm` o `tsvector` si el volumen lo justifica.
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
- La migración `20260831203000_phase2_catalog_management` agrega el índice de la
  consulta administrativa `(status, updated_at)` sin modificar migraciones previas.
- `npm run db:verify` comprueba invariantes y mínimos del seed sin exigir cantidades
  exactas, por lo que sigue siendo válido después de operar el catálogo.
- La migración `20260901023000_phase4_customers` crea clientes y direcciones,
  vincula carritos y agrega constraints/índices parciales sin modificar historial.
- La migración `20260901110000_phase5_checkout_orders_shipping` agrega métodos de
  entrega, pedidos, snapshots, historial, idempotencia y constraints monetarias.
