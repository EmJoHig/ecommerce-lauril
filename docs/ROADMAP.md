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
- Validación final de permisos, 404 administrativos, responsive y base reproducible.

## Fase 8 — CI y validación automática

Estado: completada y validada.

- GitHub Actions para pushes y pull requests sobre `main`.
- Instalación reproducible de dependencias.
- Prisma Generate.
- Lint.
- Typecheck.
- Suite completa de tests.
- Build de producción.
- La validación global se delega preferentemente a CI para reducir ejecuciones locales innecesarias.

## Fase 9 — Flujo público funcional

Estado: completada y validada.

- Inicio, catálogo, categorías, búsqueda y ficha de producto.
- Variantes, carrito y checkout.
- Registro, login y cuenta de cliente.
- Direcciones.
- Historial real de pedidos del cliente.
- Detalle protegido de pedido.
- Navegación coherente entre cuenta, pedidos, catálogo y búsqueda.
- Estados vacíos y recuperación básica de errores públicos.

El pulido visual definitivo, accesibilidad avanzada y refinamiento responsive se realizarán posteriormente y no bloquean la continuidad funcional.

## Fase 10 — Configuración mínima de la tienda

Estado: completada y validada.

- Configuración single-store persistente.
- Nombre comercial.
- Email público.
- Teléfono y WhatsApp.
- Dirección.
- Instagram y Facebook.
- Descripción pública breve.
- Administración de configuración comercial.
- Consumo de configuración desde tienda pública y metadata.
- La lectura dinámica de configuración no requiere PostgreSQL durante el build.

## Fase 11 — Adaptadores productivos

Objetivo: reemplazar dependencias exclusivamente locales o de desarrollo por implementaciones aptas para producción.

### Fase 11A — ObjectStorage productivo

- Implementar adaptador S3-compatible detrás del contrato `ObjectStorage` existente.
- Mantener el almacenamiento local exclusivamente para desarrollo.
- Configuración mediante variables de entorno.
- No incorporar procesamiento avanzado de imágenes ni CDN salvo necesidad real.

### Fase 11B — EmailSender productivo

- Implementar un proveedor real detrás del contrato `EmailSender`.
- Recuperación de contraseña.
- Confirmaciones transaccionales esenciales que correspondan al flujo existente.
- Sin campañas de marketing ni automatizaciones comerciales.

### Fase 11C — Jobs operativos

- Programar expiración y liberación de reservas de pedidos.
- Incorporar únicamente limpiezas operativas justificadas por casos de uso existentes.
- Evitar introducir infraestructura distribuida de jobs sin necesidad.

## Fase 12 — Staging y datos reales

- Crear y validar un entorno de staging.
- PostgreSQL administrado.
- Variables de entorno.
- `prisma migrate deploy`.
- Health check.
- Object storage productivo.
- Email productivo.
- Scheduler operativo.
- Backups básicos.
- Cargar catálogo, imágenes y métodos de entrega reales de Lauril.
- Validar el flujo completo sin pagos reales.

## Fase 13 — Hardening de seguridad

- Revisión dirigida de autenticación y sesiones.
- RBAC y autorización server-side.
- Ownership e IDOR.
- Cookies y headers.
- Rate limiting.
- CSRF cuando corresponda a la arquitectura.
- Uploads.
- Checkout y acceso a pedidos.
- Manejo de errores, secretos y logging.
- Corregir bloqueos reales de seguridad antes de incorporar pagos.

No realizar refactors generales ni auditorías cosméticas.

## Fase 14 — Mercado Pago

- Implementar `PaymentGateway`.
- Mercado Pago Checkout Pro.
- Persistencia de pagos y eventos.
- Webhooks firmados.
- Verificación server-side del pago.
- Idempotencia.
- Múltiples intentos de pago cuando corresponda.
- Transición segura de `PENDING_PAYMENT` a `PAID`.
- Conversión atómica de reserva a venta.
- `InventoryMovement` físico de venta exactamente una vez.
- Política explícita para pagos rechazados, expirados y reembolsos.

El retorno del navegador nunca confirma un pago.

## Fase 15 — E2E y producción

- Automatizar únicamente los recorridos críticos de mayor valor.
- Visitante y cliente.
- Catálogo.
- Carrito.
- Checkout.
- Pago.
- Pedido.
- Operación administrativa.
- Inventario.
- Email.
- Expiración.
- Responsive crítico.
- Validación final en staging.
- Migraciones y backup.
- Procedimiento de rollback.
- Publicación en producción.
- Smoke test posterior al despliegue.

## Fase 16 — Productividad avanzada de catálogo

Prioridad posterior al lanzamiento.

- Importación CSV/XLSX con preview y validación.
- Exportación.
- Edición masiva.
- Incrementos de precios.
- Duplicación u operaciones masivas justificadas por uso real.

## Fase 17 — Reportes operativos

Prioridad posterior al lanzamiento.

- Ventas.
- Pedidos.
- Productos.
- Clientes.
- Inventario.
- Rangos de fechas.
- Exportación cuando aporte valor operativo.

## Fase 18 — Promociones y precios

Prioridad posterior al lanzamiento.

- Cupones.
- Descuentos.
- Envío gratis.
- Promociones por producto o categoría.
- Promociones combinadas únicamente cuando exista necesidad comercial real.

## Fase 19 — Personalización, contenido y marketing

Prioridad posterior al lanzamiento.

- Banners.
- Bloques configurables de inicio.
- Páginas de contenido.
- Personalización visual.
- SEO adicional cuando corresponda.
- Analytics e integraciones de marketing.

No replicar diseños ni activos protegidos de terceros.

## Fase 20 — Envíos avanzados y automatizaciones

Prioridad posterior al lanzamiento.

- Zonas.
- Códigos postales.
- Tracking.
- Transportistas externos.
- Automatizaciones operativas justificadas por uso real.

No incorporar integraciones de transporte antes de existir una necesidad concreta.