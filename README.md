# Lauril Ecommerce

Ecommerce propio, single-store y construido como monolito modular con Next.js,
TypeScript, PostgreSQL, Prisma y Tailwind CSS.

La Fase 1 incluye la base ejecutable, autenticación administrativa preparada,
catálogo, categorías, variantes, inventario trazable, seed y layouts de tienda y
administración. El alcance y las fases siguientes están en
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

## Desarrollo de base de datos

```bash
npm run db:generate
npm run db:migrate -- --name nombre_del_cambio
npm run db:seed
npm run db:verify
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
- `BCRYPT_COST`: costo bcrypt entre 10 y 15.
- `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`: administrador inicial opcional.
- `S3_*`: reservadas para el adaptador de objetos de Fase 2; todavía no se usan.

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
