# Producto

## Visión

Lauril Ecommerce es la plataforma de comercio electrónico propia de una única
empresa. Ofrece una tienda pública y una administración separada visualmente,
pero se ejecuta como un monolito modular. Toma como referencia capacidades
habituales de plataformas de ecommerce sin reutilizar su código, identidad ni
diseño.

No es un SaaS multi-tienda. No se incluye `tenantId` en todas las tablas ni se
introduce complejidad multi-tenant preventiva. La configuración de la tienda es
única. Los límites modulares y los contratos de integración permiten evolucionar
sin reescribir el núcleo.

## Usuarios

- Visitante: navega catálogo, busca, filtra y usa un carrito anónimo.
- Cliente: administra perfil y direcciones, compra y consulta sus pedidos.
- Operador: gestiona pedidos, preparación, clientes e inventario según permisos.
- Administrador: configura catálogo, ventas, marketing, diseño e integraciones.

## Capacidades objetivo

### Tienda pública

Inicio configurable, catálogo, categorías, búsqueda y filtros, ficha con imágenes
y variantes, carrito persistente, checkout, cuenta de cliente, direcciones e
historial de pedidos. Debe ser accesible, responsive y usable desde teclado.

### Operación

Catálogo y variantes, movimientos trazables de inventario, clientes, carritos,
pedidos, pagos, envíos, promociones, contenidos, reportes y administración con
roles y permisos.

### Integraciones

- Mercado Pago Checkout Pro, detrás de `PaymentGateway`.
- Envíos configurables, detrás de `ShippingProvider`.
- Archivos e imágenes, detrás de `ObjectStorage`, preparado para S3 compatible.
- Email transaccional, detrás de `EmailSender`.

## Principios funcionales

- El servidor vuelve a obtener productos, precios, promociones, envío y stock al
  confirmar un checkout. Los totales enviados por el navegador son informativos.
- Un pedido guarda snapshots inmutables de los artículos y direcciones compradas.
- El regreso del navegador desde un gateway nunca confirma un pago.
- Webhooks y comandos sensibles tienen claves de idempotencia.
- El stock disponible es `stockOnHand - stockReserved`; las mutaciones se registran
  como movimientos y se ejecutan en transacciones.
- La baja de información con valor histórico se realiza por estado o archivo, no
  mediante borrado físico indiscriminado.

## Alcance actual

La Fase 2 entrega la gestión administrativa del catálogo y su publicación real:
ABM lógico de productos, variantes, categorías e imágenes; búsqueda, filtros,
paginación, ajuste trazable de inventario y catálogo público con ficha, variantes
y SEO basado en datos reales. El almacenamiento local de desarrollo está detrás
de `ObjectStorage`, listo para sustituirse por un proveedor S3 compatible.

Carrito, checkout, clientes ecommerce, pedidos, pagos, promociones y envíos no
forman parte de esta fase y permanecen deshabilitados o sin interfaz ficticia.

## Criterios no funcionales

- TypeScript estricto, validación server-side y errores consistentes.
- Migraciones reproducibles, logs estructurados y auditoría de acciones críticas.
- Pruebas unitarias para reglas y pruebas de integración para persistencia e
  integraciones.
- SEO técnico, buen rendimiento móvil y accesibilidad WCAG 2.2 AA como objetivo.
- Despliegue reproducible en Render; PostgreSQL administrado y objetos fuera del
  filesystem efímero de la aplicación.
