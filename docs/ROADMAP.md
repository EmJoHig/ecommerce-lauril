# Roadmap

En la arquitectura vigente, cada fase que cambia persistencia termina con schema
e índices MongoDB sincronizables mediante `npm run db:push`, seed actualizado
cuando corresponde, documentación y validaciones exitosas. `npm run db:verify`
valida la persistencia. Una fase no habilita automáticamente la siguiente.

Las menciones a PostgreSQL en las fases antiguas describen exclusivamente el
estado histórico original de esas fases. No son instrucciones vigentes: la única
persistencia actual es MongoDB Atlas y no se utiliza Prisma Migrate ni migraciones
SQL.

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
  verificador de persistencia de la operación completa.

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
- La lectura dinámica de configuración no conecta a MongoDB Atlas durante el build.

## Fase 11 — Adaptadores productivos

Estado: completada y validada.

Objetivo: reemplazar dependencias exclusivamente locales o de desarrollo por implementaciones aptas para producción.

### Fase 11A — ObjectStorage productivo

Estado: completada y validada.

- Implementar adaptador S3-compatible detrás del contrato `ObjectStorage` existente.
- Mantener el almacenamiento local como driver predeterminado en todos los entornos.
- Conservar el adaptador S3-compatible disponible para una activación futura explícita.
- Configuración mediante variables de entorno.
- No incorporar procesamiento avanzado de imágenes ni CDN salvo necesidad real.

### Fase 11B — EmailSender productivo

Estado: completada y validada.

- Implementar un proveedor real detrás del contrato `EmailSender`.
- Recuperación de contraseña.
- Confirmaciones transaccionales esenciales que correspondan al flujo existente.
- Sin campañas de marketing ni automatizaciones comerciales.

### Fase 11C — Jobs operativos

Estado: completada y validada.

- Programar expiración y liberación de reservas de pedidos.
- Incorporar únicamente limpiezas operativas justificadas por casos de uso existentes.
- Evitar introducir infraestructura distribuida de jobs sin necesidad.

## Fase 12 — Infraestructura productiva, integraciones y datos reales

Objetivo: validar y formalizar la infraestructura productiva ya desplegada antes
del hardening y los pagos. Las Fases 12A, 12B y 12C están completadas y validadas;
por lo tanto, la Fase 12 está completada y validada.

### Fase 12A — Validación del VPS productivo

Estado: completada y validada.

- Aplicación Next.js operativa en el VPS definitivo.
- Producción desplegada desde `main`.
- Working tree productivo limpio y sincronizado.
- PM2 validado como process manager con Node 22.23.2 y PM2 7.0.4.
- `pm2-root.service` habilitado mediante systemd y `pm2 save` realizado.
- Reboot real validado: `pm2-root.service` quedó `active (running)` y
  `pm2 resurrect` restauró `lauril-ecommerce` automáticamente en estado `online`.
- Nginx activo y configuración válida.
- Dominio y HTTPS operativos.
- MongoDB Atlas validado como única persistencia.
- `npm run db:verify` aprobado sin inconsistencias.
- `/api/health` validado con `status: ok`.
- `/api/health?deep=1` validado con `status: ok` y `database: reachable`.
- Backup automático semanal del VPS disponible.
- `db:push` se reserva para despliegues que incluyan cambios reales de schema o índices.

Las mejoras operativas adicionales no bloqueantes se registran en una sección
independiente y no condicionan el avance a Fase 12B.

### Fase 12B — Integraciones productivas

Estado: completada y validada.

- Producción utiliza `LocalObjectStorage` con `OBJECT_STORAGE_DRIVER=local`; las
  imágenes persisten en `/var/lib/lauril/uploads` y Nginx sirve `/uploads/`.
  Se validaron en producción la creación y edición de productos, la subida y
  persistencia reales de imágenes y su visualización correcta.
- El adaptador S3-compatible con Cloudflare R2 continúa implementado pero
  inactivo. Su activación queda postergada como pendiente operativo no bloqueante.
- Resend está configurado y se validó la entrega real mediante la recuperación
  de contraseña.
- La recuperación de contraseña se validó end-to-end: solicitud, recepción del
  correo, enlace, cambio de contraseña y login posterior.

### Fase 12C — Datos reales y smoke test

Estado: completada y validada.

- Se validaron en producción el catálogo, las categorías, los productos, los
  precios, el stock y las imágenes reales de Lauril.
- Se validaron los datos comerciales reales de `StoreSettings` y los métodos de
  entrega configurados.
- El flujo público sin pagos quedó validado de inicio a categoría, producto,
  carrito, checkout, creación de pedido `PENDING_PAYMENT` y visualización del
  pedido, tanto para checkout invitado como autenticado.
- El checkout conserva datos, dirección, método de entrega y modo de dirección
  ante errores de validación; para clientes autenticados usa datos personales
  server-side autocompletados y de solo lectura, que siguen siendo autoritativos.
- El pedido apareció correctamente en el backoffice y su reserva incrementó
  `Inventory.stockReserved` sin modificar `stockOnHand`.
- La liberación se validó mediante la cancelación administrativa del pedido:
  disminuyó `stockReserved` y restauró el stock disponible. La corrección admite
  tanto `reservationReleasedAt: null` como documentos donde el campo está ausente;
  la misma compatibilidad se incorporó a `db:expire-orders`.
- El smoke mobile básico recorrió el flujo público completo en producción sin
  bloqueos responsive relevantes.

Mercado Pago continúa fuera de alcance y se implementará en Fase 14.

## Pendientes operativos no bloqueantes

Estas tareas son mejoras de operación y mantenimiento. No forman parte del
criterio de cierre de la Fase 12, no bloquean fases posteriores y se realizarán
únicamente cuando el responsable del proyecto decida iniciarlas.

- Normalizar la versión de Node y PM2 por defecto de las sesiones SSH.
- Implementar un backup lógico independiente de MongoDB Atlas.
- Formalizar un runbook de deploy.
- Formalizar un runbook de rollback.
- Activar en el futuro Cloudflare R2/S3 en reemplazo del almacenamiento local.
- Automatizar `npm run db:expire-orders`. El comando manual continúa disponible,
  pero actualmente no existe cron, systemd timer ni otro scheduler activo.
- Elegir el scheduler adecuado —cron, systemd timer u otro mecanismo—.
- Definir la frecuencia de ejecución en UTC.
- Evitar ejecuciones solapadas.
- Incorporar observabilidad mínima del job.

## Fase 13 — Hardening de seguridad

Estado: completada y validada.

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

Estado: completada y validada.

La integración utiliza Checkout Pro mediante Mercado Pago Orders API
(`POST /v1/orders`), no la API clásica de Preferences. El dominio conserva un
contrato `PaymentGateway`; Mercado Pago es un adaptador de infraestructura.

### F14A — Fundación de pagos, persistencia y contratos

Estado: completada y validada.

- `PaymentAttempt` 1:N por pedido, snapshots monetarios y estados internos
  provider-neutral.
- `PaymentEvent` como inbox idempotente persistido antes de producir efectos.
- Ports de gateway y repositorios, adaptadores Prisma e índices MongoDB.
- Sin API externa, webhook, checkout público, transición `PAID` ni inventario.

### F14B — Adapter Orders API

Estado: completada y validada.

- Adapter nativo para crear el checkout externo mediante `POST /v1/orders` y
  consultar su estado con `GET /v1/orders/{id}`.
- Reutilizar la clave local persistida como `X-Idempotency-Key` en reintentos
  técnicos del mismo intento.
- Consultar server-side el estado autoritativo del recurso externo.
- Garantizar como máximo un intento `CREATED` o `PENDING` por pedido y permitir
  uno nuevo después de `REJECTED` o `CANCELLED`.
- Feature flag `MERCADO_PAGO_ENABLED` deshabilitada por defecto. El retorno del
  navegador es solo UX y nunca confirma ni modifica el pago.

### F14C — Webhook y aprobación atómica

Estado: completada y validada.

- El webhook público valida HMAC-SHA256 sobre el `data.id` del query normalizado
  a minúsculas como validación primaria, `x-request-id` y `ts`, y persiste el
  inbox antes de consultar al proveedor o producir efectos. Sólo IDs de prueba
  `ORDTST...` admiten el fallback HMAC con casing exacto acotado para sandbox.
- `GET /v1/orders/{id}` es la única fuente autoritativa; únicamente
  `processed/accredited`, con recurso, referencia externa, ARS y montos exactos,
  habilita aprobación automática.
- Pedido, inventarios con `Inventory.version`, movimientos `SALE`, historial,
  intento y evento se confirman en una sola transacción. Un índice único parcial
  refuerza un único `SALE` por inventario/pedido.
- La aprobación compite atómicamente con expiración. Si cancelación/liberación
  gana, o falta la reserva, no vende ni vuelve a reservar: inicia el auto-refund
  total idempotente implementado en F14D y validado en F14E.
- `MERCADO_PAGO_ENABLED` continúa deshabilitada por defecto.

### F14D — Estados, reintentos y reembolsos

Estado: completada y validada.

- Rechazo y cancelación terminan el intento, no el pedido: mientras la reserva
  siga vigente, `PENDING_PAYMENT` admite un intento nuevo con otra clave.
- `PaymentRefund` conserva idempotencia propia y admite reembolsos parciales y
  totales mediante Orders API. Un refund nunca repone stock automáticamente.
- Un pago acreditado después de cancelación/liberación inicia un refund total
  idempotente. El pedido local permanece `CANCELLED` aun después de confirmarlo.
- `MERCADO_PAGO_ENABLED` continúa en `false` por defecto.

### F14E — Integración de prueba y cierre

Estado: completada y validada.

Validaciones reales realizadas en staging aislado con Checkout Pro / Orders API:

- Pago aprobado automático y pago pendiente/processing.
- Cancelación de un `PaymentAttempt`, nuevo intento y posterior aprobación.
- Una única SALE y transición PAID; webhook duplicado sin repetir efectos.
- Refund parcial y total confirmados, sin restock automático.
- Pago tardío tras expirar/liberar reserva: pedido `CANCELLED`, sin SALE ni cambios
  de `stockOnHand`, con `stockReserved=0` y refund FULL idempotente.
- `unprocessable_content` inmediatamente después de acreditar conserva el mismo
  refund y clave para retry, sólo en auto-refund tardío. La confirmación autoritativa
  posterior deja intento `REFUNDED` y refund `CONFIRMED`, incluso si quedó en revisión
  y puede correlacionarse inequívocamente.
- Firma primaria en minúsculas y compatibilidad con casing exacto limitada a IDs
  sandbox `ORDTST...`; Orders productivas exigen minúsculas en el manifest.

El retorno del navegador nunca confirma un pago; el GET autoritativo es la fuente
de verdad. Cerrar F14 no implica la habilitación comercial automática:
la habilitación comercial final corresponde a F15 y continúa pendiente.

## Fase 15 — E2E y habilitación comercial

Estado: en curso; habilitación comercial pendiente de autorización explícita.

F15A implementada: infraestructura E2E inicial con Playwright/Chromium y smoke
no destructivo de home → catálogo. Ejecución local con `webServer` o contra una
URL de pruebas mediante `E2E_BASE_URL`; instrucciones en `e2e/README.md`.
F15B implementada y validada contra `https://staging.tecnoclean.shop` el
2026-09-21: tres recorridos de catálogo → ficha → carrito, persistencia/eliminación
del carrito invitado y responsive público mobile. Los tres tests y el smoke F15A
pasaron; las líneas creadas se eliminaron por UI. Sin pedidos, cambios de stock
físico, pagos ni operaciones administrativas. La ficha usa su variante
predeterminada, sin selector visible. Ejecución manual/local; integrar E2E como
check obligatorio queda para una etapa posterior con entorno aislado, fuera de
F15B. F15 todavía no está completa. Se realizó una validación real controlada de
Mercado Pago en producción; la habilitación comercial final continúa pendiente.

F15C automatizada hasta checkout: dos recorridos públicos, desktop y mobile,
de catálogo → ficha → carrito → `Iniciar compra` → `/checkout`. Cubren campos
obligatorios del invitado, métodos de entrega descubiertos por UI, campos de
dirección condicionales, producto, subtotal, envío, total y actionability de
`Confirmar pedido` sin pulsarlo. Reutilizan helpers de F15B y limpian el carrito
por UI. Requieren un producto disponible y entregas con y sin dirección; no
fijan datos comerciales ni crean fixtures. No crean pedidos, inician pagos,
modifican stock físico ni envían emails. La creación de pedido y el pago se
validan por separado de forma controlada; no se automatiza la confirmación.
Validación final contra `https://staging.tecnoclean.shop` el 2026-09-21:
los seis E2E pasaron juntos en una misma ejecución de la suite completa.
Typecheck correcto; limpieza de carritos verificada por UI.

### F15D — Validación operativa controlada

Validada según el registro operativo de las pruebas realizadas:

- Creación de pedido invitado en staging con estado inicial `PENDING_PAYMENT`.
- La reserva incrementa `stockReserved` sin reducir `stockOnHand`.
- La cancelación administrativa libera la reserva; no se crea movimiento `SALE`.
- Historial y auditoría correctos.
- Expiración mediante `npm run db:expire-orders`; segunda ejecución idempotente
  con `expired: 0`.
- Limpieza del pedido vencido histórico de producción #10001, sin pago ni
  `PaymentAttempt`.
- Scheduler systemd de producción probado en dos ejecuciones automáticas
  consecutivas, con periodicidad de cinco minutos y exclusión mediante `flock`.

La operación de producción y las unidades systemd de referencia se documentan
en [OPERATIONS.md](OPERATIONS.md). Staging no usa este timer de producción.

### Cierre productivo — En curso

Completado según el registro operativo del 2026-09-22:

- `npm run db:verify` productivo exitoso.
- Backup lógico con `mongodump` validado: permisos `600`, SHA-256 registrado,
  `gzip -t` correcto y `mongorestore --dryRun` correcto con 0 fallos.
- Punto de rollback remoto validado: tag `pre-f15-final-prod-20260922`, commit
  `01438d58c0f8e77108f0e04fe7ac0d901439b4e7`.

El 2026-09-22 se validó de forma no destructiva el punto de rollback:

- Tag remoto recuperable desde el VPS y resuelto al commit esperado
  `01438d58c0f8e77108f0e04fe7ac0d901439b4e7`.
- `HEAD` productivo coincidía con ese commit.
- Working tree tracked limpio.
- SHA-256 del backup validado contra el valor registrado en `OPERATIONS.md`.
- PM2 productivo `lauril-ecommerce` online.
- Timer `lauril-expire-orders.timer` activo.

Esto valida el punto y los prerrequisitos de rollback. No se ejecutó un rollback
real porque producción ya estaba en el mismo commit.

Runbook de deploy productivo y rollback de código documentado en
[OPERATIONS.md](OPERATIONS.md), junto con la referencia del backup. La restauración
de MongoDB es una operación de incidente separada y no forma parte automática
del rollback. Documentar el procedimiento no acredita su ejecución.

**Siguiente bloque pendiente:** deploy final y smoke posterior al deploy.
F15 continúa en curso; la habilitación comercial sigue pendiente de autorización
explícita. La validación de F15D no completa la fase.

### Alcance general de F15

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
- Validación final de la infraestructura productiva.
- Sincronización controlada mediante `npm run db:push` sólo ante cambios reales
  de schema/índices revisados explícitamente; validación con
  `npm run db:verify` y backup de Atlas.
- Verificación del procedimiento de rollback.
- Deploy final validado sobre la infraestructura existente.
- Smoke test posterior al deploy.
- Habilitación comercial con pagos.

## Fase 16 — Productividad avanzada de catálogo

Prioridad posterior al lanzamiento.

La importación XLSX con plantilla, preview, validación atómica, actualización por
SKU y normalización/filtro de fragancias ya está implementada antes de Fase 12 y
no forma parte del alcance pendiente de esta fase.

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
