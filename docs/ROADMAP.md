# Roadmap

Cada fase termina con migraciones reproducibles, seed actualizado, documentación,
lint, typecheck, tests y build exitosos. Una fase no habilita automáticamente la
siguiente.

## Fase 1 — Fundación, catálogo e inventario

Estado: alcance de esta entrega.

- Next.js, TypeScript estricto y Tailwind CSS.
- PostgreSQL, Prisma, primera migración y seed idempotente.
- Arquitectura modular y manejo base de configuración/errores.
- Modelo RBAC, sesiones opacas y login/logout administrativo preparado.
- Productos, categorías, imágenes, variantes e inventario con movimientos.
- Layout responsive de tienda, catálogo inicial y panel administrativo base.
- Health check y páginas de productos/stock para verificar integración.
- Pruebas unitarias de dinero, stock y validaciones del catálogo.

No incluye carrito, pedidos, Mercado Pago, cotización real de envíos ni ABM completo.

## Fase 2 — Experiencia de catálogo, clientes y carrito

- ABM administrativo completo de productos, categorías, variantes e imágenes.
- Adaptador S3 compatible con carga firmada y procesamiento básico de imágenes.
- Búsqueda, filtros, paginación, categorías, ficha y productos relacionados.
- Registro/login de clientes, recuperación de contraseña, perfil y direcciones.
- Carrito invitado persistente, carrito autenticado y fusión segura al iniciar
  sesión.
- Motor de cálculo de carrito server-side, disponibilidad y precio promocional.
- SEO técnico: metadata, canonical, OpenGraph, sitemap, robots y Product JSON-LD.
- Tests de permisos, carrito, fusión y concurrencia de inventario.

## Fase 3 — Checkout, pedidos, descuentos y envíos propios

- Motor extensible de descuentos/cupones y trazabilidad de usos.
- `CustomShippingProvider`, zonas, códigos postales y administración de métodos.
- Checkout server-side, snapshots, reservas y expiración de stock.
- Pedidos, items, máquina de estados, historial y vistas de cliente/administración.
- Emails detrás de un contrato, con outbox e idempotencia.
- Tests de totales, promociones, pedido, transiciones y sobreventa.

## Fase 4 — Mercado Pago y reembolsos

- `PaymentGateway` y `MercadoPagoPaymentGateway` con Checkout Pro.
- Preferencias, retorno pendiente, webhooks firmados, inbox idempotente y
  conciliación.
- Pagos, eventos, rechazos, cancelaciones, reembolsos parciales/totales.
- Métricas y alertas de inconsistencias.
- Suite de contratos, webhooks duplicados/fuera de orden e idempotencia integral.

## Fase 5 — Operación, marketing, diseño y reportes

- Dashboard y reportes de ventas, pedidos, conversión e inventario.
- Gestión operativa de envíos, preparación y reembolsos.
- Banners, páginas, colores, logo, contenido y configuración SEO.
- Promociones avanzadas (2x1, 3x2, segunda unidad y combinabilidad).
- Auditoría consultable y permisos granulares de administradores.

## Fase 6 — Escala y producción

- Importación/exportación CSV/XLSX y actualización masiva de precios con preview.
- Docker de producción, Blueprint/servicios Render, S3, email y observabilidad.
- Rate limiting compartido, hardening, performance, accesibilidad y carga.
- Backups/restores, runbooks, CI/CD, entornos preview y checklist de lanzamiento.
- Evaluar extracción de servicios solo a partir de métricas, nunca por anticipación.
