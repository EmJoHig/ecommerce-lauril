# Seguridad

## Modelo de amenazas básico

Activos principales: cuentas, datos personales, precios, stock, pedidos, tokens de
pago y permisos administrativos. Límites de confianza: navegador/servidor,
servidor/proveedores y aplicación/base de datos.

## Identidad y sesiones

- Contraseñas con bcrypt y costo configurable entre 10 y 15. Se exige un mínimo de
  12 caracteres y un máximo real de 72 bytes UTF-8 para evitar la truncación de
  bcrypt.
- Tokens de sesión y recuperación generados con CSPRNG; solo se persiste SHA-256.
- Cookie `HttpOnly`, `SameSite=Lax`, `Secure` en producción, `Path=/` y expiración.
- Rotar sesión al autenticar y revocar en logout/cambio de contraseña.
- Mensajes de login/recuperación no revelan si una cuenta existe.
- Rate limiting por IP e identidad para login, recuperación, checkout y webhooks.

El seed exige una contraseña administrativa provista por entorno de al menos 12
caracteres y como máximo 72 bytes UTF-8. No contiene contraseña por defecto y una
segunda ejecución no reemplaza las credenciales de una cuenta existente.

## Autorización

RBAC usa permisos de capacidad (`admin.access`, `catalog.write`, etc.). Las rutas
administrativas validan sesión y permiso en el servidor. Ocultar un botón no es
autorización. Toda acción relevante registra actor en `AuditLog`.

## Entradas, salidas y negocio

- Validación de esquema en cada borde con límites de longitud y listas permitidas.
- React escapa texto por defecto; HTML enriquecido requiere sanitizador y política
  explícita antes de habilitarse.
- Precios, descuentos, envío, totales, rol y estados se recalculan en servidor.
- Consultas parametrizadas mediante Prisma; SQL crudo solo con revisión.
- Protección CSRF mediante cookies SameSite, comprobación de origen en mutaciones
  sensibles y tokens cuando el flujo lo necesite.

## Carrito anónimo

- Cookie opaca de 256 bits, `HttpOnly`, `SameSite=Lax`, `Path=/`, prioridad alta y
  `Secure` en producción; no contiene precio, stock, UUID ni datos personales.
- PostgreSQL almacena únicamente SHA-256 del token. Cambiar un UUID o `variantId`
  no concede acceso: todas las mutaciones vuelven a resolver el carrito desde la
  cookie y acotan el artículo por pertenencia.
- Las Server Actions aceptan solamente variante y cantidad, validan nuevamente en
  aplicación y se benefician de la comprobación Origin/Host y POST de Next.js.
- El precio, estado de publicación y stock se vuelven a consultar en servidor.
  Leer o modificar el carrito no reserva stock ni crea movimientos.
- La expiración deslizante es de 30 días por defecto y se configura con
  `CART_TTL_DAYS`. Los índices permiten limpieza futura de carritos abandonados.

## Clientes, direcciones y carrito autenticado

- La cookie cliente es opaca, `HttpOnly`, `SameSite=Lax`, `Secure` en producción
  y diferente de la cookie administrativa. La base conserva solo SHA-256.
- El login cliente exige `Customer` activo; `/admin` sigue exigiendo el permiso
  `admin.access` desde la cookie administrativa. Crear una cuenta no asigna roles.
- Registro/login usan mensajes genéricos y comparación bcrypt dummy cuando la
  identidad no existe. Las contraseñas nunca se incluyen en logs o retornos.
- Recuperación invalida tokens previos, vence a los 30 minutos por defecto, acepta
  un solo uso y revoca sesiones al cambiar la contraseña. El preview solo se
  devuelve en desarrollo y usa fragmento URL para que el token no llegue a logs;
  producción no lo revela.
- Toda dirección se consulta por ID y propietario derivado de sesión. Los IDs del
  formulario no otorgan ownership.
- La cookie invitada se elimina solo después de una fusión exitosa. El carrito
  cliente se consulta exclusivamente por `customerId` derivado de la sesión.
- Un limitador en memoria protege login, registro y recuperación en la instancia
  actual. Antes de escalar horizontalmente debe reemplazarse por un backend
  compartido.

## Secretos y datos

- `.env` está ignorado; `.env.example` contiene nombres y ejemplos no sensibles.
- Tokens de Mercado Pago, S3 y email solo en variables de entorno de Render.
- Logs excluyen contraseñas, cookies, tokens, firmas y payloads personales completos.
- TLS en tránsito, backups cifrados del proveedor y mínimo privilegio para DB/S3.
- Definir política de retención y proceso de exportación/eliminación de datos antes
  de producción.

## Integraciones y webhooks

Verificar firma y timestamp, limitar payload, registrar ID externo único, consultar
al proveedor para confirmar estados sensibles y procesar idempotentemente. SSRF se
evita usando endpoints configurados, no URLs arbitrarias recibidas del cliente.

## Dependencias y operación

- Versiones fijadas por lockfile; actualizar con revisión y ejecutar auditoría.
- CI ejecuta lint, typecheck, tests y build.
- Migraciones con usuario restringido y despliegue controlado.
- Health checks no exponen configuración interna.
- Alertas para errores de autenticación, webhooks y transiciones imposibles.

## Pendientes antes de producción

Rate limiter compartido, proveedor real de correo, CSP y cabeceras completas,
rotación de secretos, Sentry/OpenTelemetry, política de privacidad,
backups/restores probados, pruebas de autorización por permiso y revisión OWASP.
