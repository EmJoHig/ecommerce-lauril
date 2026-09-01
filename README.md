# Lauril Ecommerce

Ecommerce propio, single-store y construido como monolito modular con Next.js,
TypeScript, PostgreSQL, Prisma y Tailwind CSS.

La Fase 3 incluye gestión administrativa y publicación del catálogo, inventario
trazable y un carrito anónimo persistente con recálculo server-side. No incluye
checkout, clientes ecommerce, pedidos ni pagos. El alcance y las fases siguientes están en
[`docs/ROADMAP.md`](docs/ROADMAP.md).

## Requisitos

- Node.js 20.19 o superior (probado con Node 24).
- Docker Desktop para PostgreSQL local, o una instancia PostgreSQL accesible.
- npm 10 o superior.

## Puesta en marcha

1. Copiar `.env.example` como `.env` y reemplazar los valores de desarrollo.
2. Definir una contraseña local de PostgreSQL y, si se desea acceder al panel,
   `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD` (mínimo 12 caracteres y máximo 72
   bytes UTF-8).
3. Ejecutar:

```bash
docker compose up -d postgres
npm install
npm run db:migrate:deploy
npm run db:seed
npm run dev
```

Abrir `http://localhost:3000` para la tienda y `http://localhost:3000/admin` para
la administración. El health check superficial está en `/api/health`; agregar
`?deep=1` también verifica PostgreSQL.

Rutas principales de Fases 2 y 3:

- `/admin/productos`, `/admin/categorias` y `/admin/stock` para la operación.
- `/productos`, `/categorias/[slug]` y `/producto/[slug]` para la tienda.
- `/carrito` para consultar y modificar el carrito anónimo persistente.

Las imágenes subidas en desarrollo se guardan en `public/uploads/catalog`, que
está ignorado por Git. No usar ese adaptador en Render porque su filesystem es
efímero.

## Desarrollo de base de datos

```bash
npm run db:generate
npm run db:migrate -- --name nombre_del_cambio
npm run db:seed
npm run db:verify
npm run db:verify:phase2
npm run db:verify:phase3
npm run db:studio
```

En producción se ejecuta `npm run db:migrate:deploy`, nunca `migrate dev`.

## Calidad

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Variables de entorno

- `DATABASE_URL`: conexión PostgreSQL; obligatoria al ejecutar la aplicación,
  instalar dependencias, generar Prisma, migrar, ejecutar el seed o iniciar la app.
- `APP_URL`: origen público de la tienda.
- `SESSION_COOKIE_NAME`, `SESSION_TTL_DAYS`: configuración de sesión.
- `CART_COOKIE_NAME`, `CART_TTL_DAYS`: cookie opaca y expiración deslizante del
  carrito anónimo; los valores predeterminados son `lauril_cart` y 30 días.
- `BCRYPT_COST`: costo bcrypt entre 10 y 15.
- `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`: administrador inicial opcional.
- `S3_*`: reservadas para el futuro adaptador S3 compatible; el adaptador local no
  necesita variables adicionales.

No hay credenciales predeterminadas en el repositorio. `.env` está ignorado por
Git.

## Documentación

- [`AGENTS.md`](AGENTS.md): mapa breve para agentes y colaboradores.
- [`docs/PRODUCT.md`](docs/PRODUCT.md): alcance funcional.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): módulos y dependencias.
- [`docs/DATABASE.md`](docs/DATABASE.md): modelo, constraints e índices.
- [`docs/PAYMENTS.md`](docs/PAYMENTS.md): diseño futuro de Mercado Pago.
- [`docs/SHIPPING.md`](docs/SHIPPING.md): abstracción de envíos.
- [`docs/SECURITY.md`](docs/SECURITY.md): controles y pendientes.
- [`docs/ROADMAP.md`](docs/ROADMAP.md): fases y criterios de salida.
