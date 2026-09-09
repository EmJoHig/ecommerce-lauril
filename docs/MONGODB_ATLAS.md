# MongoDB Atlas

MongoDB Atlas es la única persistencia de Lauril Ecommerce.

## Recursos

- Project: `ecommerce-lauril`
- Cluster: `Cluster-lauril`
- Provider: AWS
- Region: São Paulo (`SA_EAST_1` / `sa-east-1`)
- Database: `lauril_ecommerce`
- Database user: `lauril_ecommerce_app`

El proyecto `tecnoclean-web-bd` y su cluster pertenecen a otra aplicación. No se
reutilizan usuarios, credenciales, datos ni entradas de Network Access, y no deben
modificarse desde este repositorio.

## Conexión

La aplicación y Prisma leen exclusivamente:

```dotenv
MONGODB_URI=
```

La URI real debe incluir `/lauril_ecommerce` antes de sus parámetros y existir
solo en `.env` o en el gestor de secretos del proveedor. Nunca se versiona ni se
incluye en logs, documentación o reportes.

El usuario de aplicación tiene `readWrite` únicamente sobre
`lauril_ecommerce`. En desarrollo, Network Access admite solo la IP pública
necesaria. No se habilita `0.0.0.0/0`. Para producción se debe autorizar el egreso
estable del proveedor o utilizar conectividad privada, sin copiar la configuración
del proyecto Tecnoclean.

## Prisma

MongoDB usa Prisma ORM 6.19 porque la línea Prisma 7 utilizada anteriormente no
ofrece compatibilidad completa con el conector MongoDB. No se usa driver adapter.

Todos los IDs de dominio continúan siendo UUID `String` y se mapean a `_id`. Las
relaciones N:M explícitas tienen un ID UUID propio más un índice compuesto único.
Las relaciones siguen siendo referencias entre colecciones; no se migró el modelo
a documentos embebidos.

Atlas provee el replica set requerido por las transacciones MongoDB. Inventario,
reservas, checkout, historial y auditoría permanecen dentro de transacciones. Los
cambios de stock y reservas también usan compare-and-swap mediante
`Inventory.version`. Los números de pedido se asignan con un documento contador
actualizado dentro de la misma transacción.

## Operación

```bash
npm install
npm run db:generate
npm run db:push
npm run db:seed
npm run db:verify
npm run db:studio
npm run dev
```

`db:push` sincroniza las colecciones e índices declarados por Prisma y luego
ejecuta `scripts/ensure-mongodb-indexes.ts`. Ese script mantiene los índices
parciales que Prisma Schema no puede expresar:

- una variante predeterminada por producto;
- una dirección predeterminada por cliente;
- un carrito activo por cliente;
- unicidad de hashes opcionales de carrito y pedido invitado.

MongoDB no utiliza Prisma Migrate. No hay migraciones SQL activas, PostgreSQL
local, Compose ni Docker como requisito de base de datos.

`db:verify` realiza un ping no destructivo y comprueba seed, índices aplicados,
relaciones e invariantes de catálogo, inventario, carrito y pedidos. Prisma Studio
se abre con `npm run db:studio` y utiliza la misma `MONGODB_URI`.
