# Lauril Ecommerce

Ecommerce propio, single-store y construido como monolito modular con Next.js,
TypeScript, MongoDB Atlas, Prisma y Tailwind CSS.

Las Fases 1 a 11 y la Fase 12A están completadas y validadas: incluyen catálogo
con importación Excel y filtro por fragancia, carrito, cuentas, checkout, métodos
propios de entrega,
pedidos, reserva temporal, configuración single-store, backoffice consolidado,
ObjectStorage S3-compatible, email productivo mediante Resend y el job operativo
de expiración. El storefront público ya incorpora los ajustes visuales y
responsive actuales. No incluye Mercado Pago, pagos, promociones,
transportistas externos ni facturación. El alcance está en
[`docs/ROADMAP.md`](docs/ROADMAP.md).

## Requisitos

- Node.js 20.19 o superior (probado con Node 24).
- npm 10 o superior.
- Acceso a `Cluster-lauril` en MongoDB Atlas desde la IP de desarrollo.

## Puesta en marcha

1. Copiar `.env.example` como `.env` y reemplazar los valores de desarrollo.
2. Configurar `MONGODB_URI` con acceso a `lauril_ecommerce` y, si se desea acceder
   al panel, `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD` (mínimo 12 caracteres y
   máximo 72 bytes UTF-8).
3. Ejecutar:

```bash
npm install
npm run db:push
npm run db:seed
npm run dev
```

Abrir `http://localhost:3000` para la tienda y `http://localhost:3000/admin` para
la administración. El health check superficial está en `/api/health`; agregar
`?deep=1` también verifica MongoDB Atlas.

Rutas principales implementadas:

- `/admin/productos`, `/admin/categorias` y `/admin/stock` para la operación.
- `/admin/productos/importar` para validar, previsualizar y confirmar importaciones
  `.xlsx` de catálogo.
- `/productos`, `/categorias/[slug]` y `/producto/[slug]` para la tienda.
- `/carrito` para consultar y modificar el carrito persistente.
- `/registro`, `/login` y `/recuperar-clave` para identidad de clientes.
- `/mi-cuenta`, `/mi-cuenta/datos` y `/mi-cuenta/direcciones` para la cuenta.
- `/checkout` y `/pedido/[número]` para confirmar y consultar un pedido.
- `/admin/envios` y `/admin/pedidos` para métodos de entrega y operación diaria de pedidos.
- `/admin/clientes` para perfiles, direcciones, pedidos y notas internas.
- `/admin/stock/movimientos` para trazabilidad inmutable del inventario.
- `/admin/administradores`, `/admin/roles` y `/admin/auditoria` para gobierno del
  backoffice según permisos.
- `/admin/configuracion` para identidad y contacto públicos de la tienda.

Las imágenes subidas en desarrollo se guardan en `public/uploads/catalog`, que
está ignorado por Git. El VPS productivo utiliza Cloudflare R2 mediante el
adaptador S3-compatible; no usar allí el almacenamiento local.

## Producción

La aplicación está desplegada en el VPS definitivo: Next.js se ejecuta mediante
PM2 y Nginx actúa como reverse proxy para el dominio con HTTPS. El deploy actual
se realiza desde Git y las variables y secretos se configuran fuera del
repositorio, en el entorno productivo. MongoDB Atlas es la única persistencia;
Cloudflare R2 y Resend son los proveedores productivos configurados.

La Fase 12A quedó validada mediante un reboot real del VPS, con restauración
automática de la aplicación por systemd/PM2, Nginx activo, health checks
aprobados y MongoDB Atlas reachable. Las Fases 12B y 12C continúan pendientes.

La ejecución automática de `npm run db:expire-orders` todavía debe confirmarse y
formalizarse mediante un scheduler propio del host.

## Desarrollo de base de datos

```bash
npm run db:generate
npm run db:push
npm run db:seed
npm run db:verify
npm run db:verify:phase2
npm run db:verify:phase3
npm run db:verify:phase4
npm run db:verify:phase5
npm run db:verify:phase6
npm run db:expire-orders
npm run db:studio
```

Para una prueba manual local de Fase 6 se pueden crear pedidos sintéticos
`PENDING_PAYMENT` y `PAID` con `npm run db:fixtures:phase6`, y eliminarlos con
`npm run db:fixtures:phase6:cleanup`. El script rechaza producción y bases no
de desarrollo contra `lauril_ecommerce`; no existe una vía equivalente en la interfaz.

Los fixtures de Fase 7 para cliente, pedido y permisos del backoffice se crean con
`PHASE7_FIXTURE_PASSWORD=<valor> npm run db:fixtures:phase7` y se eliminan con
`npm run db:fixtures:phase7:cleanup`; también están deshabilitados en producción y
restringidos a la base lógica `lauril_ecommerce`.

MongoDB no usa Prisma Migrate. Los cambios de schema se sincronizan con
`npm run db:push`, que también asegura los índices parciales requeridos.
MongoDB Atlas es la única persistencia actual: no se requiere PostgreSQL local,
Docker ni Compose para la base de datos.

## Calidad

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Variables de entorno

- `MONGODB_URI`: conexión a MongoDB Atlas y a la base `lauril_ecommerce`;
  obligatoria para sincronizar schema, ejecutar el seed o iniciar la app.
- `APP_URL`: origen público de la tienda.
- `SESSION_COOKIE_NAME`, `SESSION_TTL_DAYS`: configuración de sesión.
- `CUSTOMER_SESSION_COOKIE_NAME`, `CUSTOMER_SESSION_TTL_DAYS`: sesión cliente.
- `PASSWORD_RESET_TTL_MINUTES`: vigencia del enlace de recuperación.
- `CART_COOKIE_NAME`, `CART_TTL_DAYS`: cookie opaca y expiración deslizante del
  carrito anónimo; los valores predeterminados son `lauril_cart` y 30 días.
- `ORDER_RESERVATION_MINUTES`: vigencia de la reserva pendiente; 15 por defecto.
- `BCRYPT_COST`: costo bcrypt entre 10 y 15.
- `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`: administrador inicial opcional.
- `S3_*`: obligatorias en producción para el adaptador S3-compatible (Cloudflare
  R2 es el objetivo documentado); el adaptador local de desarrollo no las necesita.
- `RESEND_API_KEY`, `EMAIL_FROM`: obligatorias en producción para enviar emails
  transaccionales mediante Resend; desarrollo usa Resend si ambas están
  configuradas y, en caso contrario, conserva el preview local. Test usa el sender
  local.

No hay credenciales predeterminadas en el repositorio. `.env` está ignorado por
Git.

## Documentación

- [`AGENTS.md`](AGENTS.md): mapa breve para agentes y colaboradores.
- [`docs/PRODUCT.md`](docs/PRODUCT.md): alcance funcional.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): módulos y dependencias.
- [`docs/DATABASE.md`](docs/DATABASE.md): modelo, constraints e índices.
- [`docs/MONGODB_ATLAS.md`](docs/MONGODB_ATLAS.md): aprovisionamiento y operación de Atlas.
- [`docs/PAYMENTS.md`](docs/PAYMENTS.md): diseño futuro de Mercado Pago.
- [`docs/SHIPPING.md`](docs/SHIPPING.md): abstracción de envíos.
- [`docs/SECURITY.md`](docs/SECURITY.md): controles y pendientes.
- [`docs/ROADMAP.md`](docs/ROADMAP.md): fases y criterios de salida.
