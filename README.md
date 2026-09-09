# Lauril Ecommerce

Ecommerce propio, single-store y construido como monolito modular con Next.js,
TypeScript, MongoDB Atlas, Prisma y Tailwind CSS.

La Fase 7 incluye catálogo, carrito, cuentas, checkout, métodos propios de entrega,
pedidos, reserva temporal y un backoffice consolidado para clientes, inventario,
ventas, administradores y auditoría. No incluye Mercado Pago, pagos, promociones,
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

Rutas principales de Fases 2 a 7:

- `/admin/productos`, `/admin/categorias` y `/admin/stock` para la operación.
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

Las imágenes subidas en desarrollo se guardan en `public/uploads/catalog`, que
está ignorado por Git. No usar ese adaptador en Render porque su filesystem es
efímero.

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
- `S3_*`: reservadas para el futuro adaptador S3 compatible; el adaptador local no
  necesita variables adicionales.
- `RESEND_API_KEY`, `EMAIL_FROM`: obligatorias en producción para enviar emails
  transaccionales mediante Resend; desarrollo y test conservan el sender local.

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
