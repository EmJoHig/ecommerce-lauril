# Lauril Ecommerce

Monolito modular de ecommerce para una única tienda. Antes de cambiar código, leer
`docs/ARCHITECTURE.md`, el documento del módulo afectado y `docs/ROADMAP.md`.

## Mapa

- `src/app`: rutas, layouts y composición de presentación (Next.js App Router).
- `src/modules`: módulos de negocio; cada uno separa `domain`, `application`,
  `infrastructure` y `presentation` cuando corresponda.
- `src/shared`: utilidades y contratos transversales sin reglas de un módulo.
- `prisma`: esquema, migraciones y seed.
- `tests`: pruebas de reglas críticas y casos de uso.
- `docs`: decisiones funcionales y técnicas detalladas.

## Reglas

- El dominio no importa Next.js, Prisma ni SDKs externos.
- La presentación no accede a Prisma directamente ni decide precios o stock.
- Todo importe se representa en centavos enteros; toda fecha se guarda en UTC.
- Toda unidad vendible es una `ProductVariant`, aun cuando el producto no tenga
  opciones visibles. El stock pertenece a la variante.
- Validar entradas en el servidor. Secretos solo mediante variables de entorno.
- Los cambios de stock se hacen mediante movimientos y una transacción.
- Agregar una migración para cada cambio de esquema; nunca editar una ya aplicada.

## Validación obligatoria

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Comandos y configuración local: `README.md`. Alcance de cada fase:
`docs/ROADMAP.md`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
