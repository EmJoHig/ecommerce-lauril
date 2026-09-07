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

Estado: completada y auditada técnicamente.

- ABM administrativo completo de productos, categorías, variantes e imágenes.
- `ObjectStorage` con adaptador local de desarrollo y límite de archivos; S3 queda
  como adaptador de producción posterior.
- Búsqueda, filtros, orden, paginación, categorías y ficha con variantes.
- Ajustes de inventario transaccionales, movimiento y auditoría administrativa.
- SEO de producto: metadata, canonical, OpenGraph y Product JSON-LD real.
- Tests de validaciones, permisos, dinero, categorías, inventario y transacciones.

No incluye clientes, carrito, checkout, pedidos, descuentos, envíos ni pagos.

## Fase 3 — Carrito anónimo

Estado: completada y validada.

- Carrito invitado persistente con token opaco y hash server-side.
- Agregar, acumular, actualizar, eliminar y vaciar artículos por variante.
- Cálculo server-side y revalidación de precios, publicación y disponibilidad.
- Contador global, página responsive y resumen rápido en ficha de producto.
- Sin reservas ni movimientos de inventario; el stock se vuelve a comprobar.
- Tests de totales, aislamiento, cambios concurrentes de catálogo y persistencia.

La autenticación de clientes y fusión invitado/cliente se trasladan a la fase
siguiente por decisión explícita de alcance; no se simulan en esta fase.

## Fase 4 — Clientes, cuenta y fusión de carrito

Estado: completada y validada.

- Registro/login/logout cliente con cookie y sesión DB separada de administración.
- Recuperación segura con `EmailSender` y preview exclusivo de desarrollo.
- Perfil comercial, email inmutable y direcciones con ownership/default atómico.
- Carrito autenticado persistente y fusión invitado/cliente serializable.
- Política de suma, límite a stock y omisión de líneas no disponibles.
- Sin checkout, pedidos, reservas, envíos, descuentos ni pagos.

## Fase 5 — Checkout, pedidos y envíos propios

Estado: completada y validada.

- Checkout invitado/cliente con revalidación completa server-side.
- `CustomShippingProvider` y administración de retiro, tarifa fija, entrega local
  y envío a coordinar; zonas y códigos postales quedan posteriores.
- Pedidos e items con snapshots, número humano, historial y acceso seguro.
- Reserva temporal, expiración/liberación idempotente y carrito convertido.
- Clave de checkout y carrito únicos para doble submit/concurrencia.
- Vistas pública pendiente y administrativas mínimas de pedidos/envíos.

No incluye pagos, Mercado Pago, cupones, promociones, transportistas externos,
facturación ni emails transaccionales reales.

## Fase 6 — Gestión administrativa de pedidos y ventas

Estado: completada y validada.

- Listado paginado con búsqueda, rango de fechas, estado, tipo de comprador,
  método de entrega y orden.
- Detalle operativo con snapshots, totales, entrega, historial con actor y notas
  internas no visibles para clientes.
- Máquina de estados centralizada: cancelación pendiente, preparación, listo,
  despacho y entrega, con flujo específico para retiro.
- Cancelación `PENDING_PAYMENT` transaccional, liberación idempotente de reserva y
  auditoría; estados pagados no se cancelan sin un futuro flujo de reembolso.
- Permisos `orders.read`/`orders.write`, fixtures exclusivamente locales y
  verificador PostgreSQL de la operación completa.

Mercado Pago continúa expresamente postergado. `PAID` no puede asignarse desde la
interfaz administrativa.

## Fase 7 — Administración integral

Estado: completada y validada.

- Navegación y layout operativo unificados según permisos.
- Clientes paginados, detalle, direcciones, pedidos, estado y notas privadas.
- Detalle de producto, stock y movimientos integrados con trazabilidad.
- Administración básica de usuarios/roles y auditoría consultable de solo lectura.
- Inicio con contadores operativos, sin gráficos ni BI.

## Fase 8 — Tienda pública completa

- Completar navegación, cuenta, pedidos públicos y experiencia responsive.
- No incluye pagos ni rediseño visual definitivo.

## Fase 9 — Gestión avanzada de catálogo y stock

- Operaciones avanzadas de catálogo e inventario aprobadas explícitamente.

## Fase 10 — Importación/exportación y catálogo real

- CSV/XLSX, validación, preview e importación idempotente.

## Fase 11 — Configuración básica

- Datos de la tienda y configuración operativa no secreta.

## Fase 12 — Emails esenciales

- Proveedor real y mensajes transaccionales mínimos.

## Fase 13 — Dashboard y reportes

- Métricas, ventas, pedidos e inventario; recién aquí se incorporan gráficos.

## Fase 14 — Diseño y UX definitivo

- Sistema visual final, accesibilidad y rendimiento responsive.

## Fase 15 — QA y staging

- Entorno de prueba, carga, hardening, backups y runbooks.

## Fase 16 — Mercado Pago

- `PaymentGateway`, Checkout Pro, webhooks firmados e idempotencia.
- Conversión atómica de reserva a venta y movimientos físicos.

## Fase 17 — Prueba end-to-end

- Validación integral de compra, pago, operación y despliegue.

## Extras posteriores

Promociones, personalización avanzada, marketing, envíos avanzados y
automatizaciones se evaluarán únicamente después de la Fase 17.
