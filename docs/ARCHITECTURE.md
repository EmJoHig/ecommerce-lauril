# Arquitectura

## Estilo

Monolito modular desplegable como una sola aplicación Next.js y una única base
PostgreSQL. Evita la latencia y operación de microservicios, mientras conserva
límites que permiten extraer un módulo solo si existe una necesidad comprobada.

```text
Browser
  -> Next.js presentation (pages, route handlers, server actions)
      -> application use cases
          -> domain rules and ports
              <- infrastructure adapters (Prisma, Mercado Pago, S3, email)
                  -> PostgreSQL / external providers
```

La composición de dependencias ocurre cerca de infraestructura. Las dependencias
de código apuntan hacia el dominio: un caso de uso conoce interfaces, no Prisma ni
SDKs. Un adaptador implementa esas interfaces.

## Módulos objetivo

- `auth`: identidad, sesiones, roles, permisos y recuperación de contraseña.
- `catalog`: productos, variantes, categorías, imágenes, atributos y SEO.
- `inventory`: existencias, reservas, movimientos y alertas de stock mínimo.
- `customers`: perfil y direcciones.
- `cart`: carrito invitado/autenticado, fusión y cálculo preliminar.
- `pricing`: dinero, promociones, cupones y cálculo autoritativo.
- `orders`: checkout, snapshots, máquina de estados e historial.
- `payments`: pagos, eventos, idempotencia y gateway Mercado Pago.
- `shipping`: cotización, métodos, zonas y despachos.
- `content`: configuración, páginas y banners.
- `reporting`: proyecciones y consultas de métricas.
- `audit`: bitácora administrativa.

Los módulos pueden consultar datos propios. Las operaciones que atraviesan varios
módulos se coordinan desde un caso de uso de aplicación y una transacción; no se
ocultan reglas de negocio en callbacks de UI.

## Estructura

```text
src/
  app/
    (store)/                 tienda pública
    (admin-auth)/            acceso administrativo
    (admin)/admin/           panel protegido
    api/health/              health check
  modules/
    <module>/
      domain/                entidades, value objects, reglas, puertos
      application/           casos de uso y DTOs
      infrastructure/        Prisma y proveedores externos
      presentation/          componentes y acciones propios del módulo
  shared/
    domain/                  Money, errores y tipos compartidos mínimos
    infrastructure/          cliente Prisma, configuración y logging
    presentation/            componentes visuales reutilizables
prisma/
  schema.prisma
  migrations/
  seed.ts
tests/
```

No todos los módulos necesitan las cuatro carpetas desde el primer día. Se crean
cuando existe código real, evitando esqueletos vacíos.

## Presentación

Se utiliza App Router y Server Components por defecto. Los Client Components se
reservan para interacción local. Server Actions y Route Handlers:

1. autentican y autorizan;
2. validan el DTO;
3. invocan un caso de uso;
4. transforman el resultado a una respuesta/redirección.

Nunca reciben como autoritativos precio, descuento, costo de envío, rol ni estado.
Las páginas dinámicas que consultan PostgreSQL se marcan explícitamente para no
conectar a la base durante el build.

## Datos y consistencia

- Prisma es un detalle de infraestructura. Los tipos Prisma no atraviesan el
  límite del módulo hacia componentes o reglas puras.
- Una transacción crea pedidos, reserva stock y registra los movimientos
  correspondientes.
- Se usa concurrencia optimista (`Inventory.version`) y actualizaciones
  condicionales para evitar sobreventa.
- Los eventos externos se persisten antes de producir efectos. Un identificador
  único del proveedor impide procesarlos dos veces.
- Los reportes complejos se implementan como consultas dedicadas; no fuerzan a las
  entidades transaccionales a convertirse en DTOs de dashboard.

## Errores, logs y observabilidad

El dominio usa errores tipados (`ValidationError`, `ConflictError`,
`NotFoundError`). El borde HTTP los traduce sin filtrar stack traces ni secretos.
El logger emite JSON con `requestId`, módulo, acción y actor cuando aplica. No se
registran contraseñas, tokens, cookies ni payloads completos de pagos.

El endpoint `/api/health` comprueba proceso y, opcionalmente, conectividad con la
base. En producción se usarán logs de stdout/stderr, health checks de Render y un
servicio externo de captura de errores.

## Autenticación

Sesiones opacas almacenadas en base. El navegador conserva un token aleatorio en
cookie `HttpOnly`, `Secure` en producción y `SameSite=Lax`; la base guarda solo su
hash SHA-256. Las contraseñas se almacenan con bcrypt y factor configurable. La
autorización consulta permisos efectivos de los roles.

Fase 1 prepara login/logout administrativo y el modelo RBAC. Registro de clientes,
recuperación completa, rotación y rate limiting distribuido se completan en Fase
2.

## Imágenes

`ProductImage` guarda clave de objeto, URL pública/servida, texto alternativo y
orden. El futuro `ObjectStorage` implementará carga firmada, eliminación y URLs.
En producción los binarios no se guardarán en el disco efímero de Render.

## Despliegue

La aplicación puede ejecutarse con el runtime Node de Render y PostgreSQL
administrado. `prisma migrate deploy` se ejecuta como pre-deploy command y la
aplicación con `npm run start`. La imagen Docker de producción se incorpora al
endurecer el despliegue; Compose en desarrollo solo levanta PostgreSQL.

## Decisiones explícitas

- App Router en lugar de Pages Router.
- Monolito modular, no microservicios ni multi-tenancy preventivo.
- Identificadores UUID y nombres SQL `snake_case` mediante `@map`/`@@map`.
- Importes enteros en unidad mínima, nunca `number` decimal para cálculos.
- Stock por variante con una variante por defecto obligatoria a nivel de caso de
  uso; no hay stock duplicado en `Product`.
- Estados y archivo lógico para registros históricos.
- Contratos propios para pagos, envíos, objetos y email.
