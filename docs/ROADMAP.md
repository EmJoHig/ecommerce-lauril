# Roadmap

Cada fase termina con migraciones reproducibles, seed actualizado, documentación,
lint, typecheck, tests y build exitosos. Una fase no habilita automáticamente la
siguiente.

## Fase 1 — Fundación, catálogo e inventario

Estado: completada y aprobada.

- Next.js, TypeScript estricto y Tailwind CSS.
- PostgreSQL, Prisma, primera migración y seed idempotente.
- Arquitectura modular y manejo base de configuración/errores.
- Modelo RBAC, sesiones opacas y login/logout administrativo preparado.
- Productos, categorías, imágenes, variantes e inventario con movimientos.
- Layout responsive de tienda, catálogo inicial y panel administrativo base.
- Health check y páginas de productos/stock para verificar integración.
- Pruebas unitarias de dinero, autenticación, stock y validaciones del catálogo.

No incluye carrito, pedidos, Mercado Pago, cotización real de envíos ni ABM completo.

## Fase 2 — Catálogo y gestión de productos

Estado: implementada; pendiente de aprobación de cierre.

- ABM administrativo completo de productos, categorías, variantes e imágenes.
- `ObjectStorage` con adaptador local de desarrollo y límite de archivos; S3 queda
  como adaptador de producción posterior.
- Búsqueda, filtros, orden, paginación, categorías y ficha con variantes.
- Ajustes de inventario transaccionales, movimiento y auditoría administrativa.
- SEO de producto: metadata, canonical, OpenGraph y Product JSON-LD real.
- Tests de validaciones, permisos, dinero, categorías, inventario y transacciones.

No incluye clientes, carrito, checkout, pedidos, descuentos, envíos ni pagos.

## Fase 3 — Clientes y carrito

- Registro/login de clientes, recuperación de contraseña, perfil y direcciones.
- Carrito invitado persistente, carrito autenticado y fusión al iniciar sesión.
- Cálculo server-side, revalidación de precios y disponibilidad.
- Reservas todavía no definitivas; el pedido se incorpora en la fase siguiente.
- Tests de sesión de cliente, carrito, fusión, totales y concurrencia básica.

## Fase 4 — Checkout, pedidos, descuentos y envíos propios

- Motor extensible de descuentos/cupones y trazabilidad de usos.
- `CustomShippingProvider`, zonas, códigos postales y administración de métodos.
- Checkout server-side, snapshots, reservas y expiración de stock.
- Pedidos, items, máquina de estados, historial y vistas de cliente/administración.
- Emails detrás de un contrato, con outbox e idempotencia.
- Tests de totales, promociones, pedido, transiciones y sobreventa.

## Fase 5 — Mercado Pago y reembolsos

- `PaymentGateway` y `MercadoPagoPaymentGateway` con Checkout Pro.
- Preferencias, retorno pendiente, webhooks firmados, inbox idempotente y
  conciliación.
- Pagos, eventos, rechazos, cancelaciones, reembolsos parciales/totales.
- Métricas y alertas de inconsistencias.
- Suite de contratos, webhooks duplicados/fuera de orden e idempotencia integral.

## Fase 6 — Operación, marketing, diseño y reportes

- Dashboard y reportes de ventas, pedidos, conversión e inventario.
- Gestión operativa de envíos, preparación y reembolsos.
- Banners, páginas, colores, logo, contenido y configuración SEO.
- Promociones avanzadas (2x1, 3x2, segunda unidad y combinabilidad).
- Auditoría consultable y permisos granulares de administradores.

## Fase 7 — Escala y producción

- Importación/exportación CSV/XLSX y actualización masiva de precios con preview.
- Docker de producción, Blueprint/servicios Render, S3, email y observabilidad.
- Rate limiting compartido, hardening, performance, accesibilidad y carga.
- Backups/restores, runbooks, CI/CD, entornos preview y checklist de lanzamiento.
- Evaluar extracción de servicios solo a partir de métricas, nunca por anticipación.
