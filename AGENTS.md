# Lauril Ecommerce

Monolito modular de ecommerce para una única tienda.

Objetivo al trabajar en este repositorio:

> Hacer el cambio correcto con el menor alcance, contexto y ejecución necesarios.

Priorizar cambios precisos y pequeños antes que exploración amplia del repositorio.

---

## Mapa del repositorio

- `src/app`: rutas, layouts y presentación con Next.js App Router.
- `src/modules`: módulos de negocio.
- `src/shared`: utilidades y contratos transversales.
- `prisma`: esquema, migraciones y seed.
- `tests`: pruebas.
- `docs`: documentación funcional y técnica.

Los módulos pueden separar:

`domain -> application -> infrastructure -> presentation`

cuando corresponda.

No crear capas, abstracciones ni archivos vacíos de forma preventiva.

---

## Protocolo inicial

Antes de modificar código:

1. Ejecutar `git status --short`.
2. Si existen cambios sin confirmar relacionados con la tarea, revisar únicamente el diff relevante.
3. Localizar los archivos afectados mediante búsquedas dirigidas.
4. Leer únicamente el código necesario para resolver la tarea.

No recorrer todo el repositorio por defecto.

No realizar búsquedas amplias sin una razón concreta.

No volver a leer archivos ya inspeccionados salvo que hayan cambiado o sea necesario resolver una duda concreta.

No revisar historial Git, migraciones antiguas, documentación general ni módulos no relacionados salvo que la tarea lo requiera.

---

## Documentación bajo demanda

No leer todos los documentos antes de cada tarea.

Consultar solamente cuando sea necesario.

### `docs/ARCHITECTURE.md`

Consultar para:

- cambios arquitectónicos;
- límites entre módulos;
- nuevas dependencias;
- nuevos servicios;
- comunicación entre varios módulos.

Leer únicamente la sección relevante.

### `docs/DATABASE.md`

Consultar para:

- Prisma;
- esquema;
- migraciones;
- índices;
- constraints;
- transacciones;
- persistencia;
- concurrencia.

### `docs/SECURITY.md`

Consultar para:

- autenticación;
- autorización;
- permisos;
- sesiones;
- cookies;
- datos sensibles;
- secretos;
- pagos;
- webhooks.

### `docs/PRODUCT.md`

Consultar cuando exista una duda funcional o de alcance del producto.

### `docs/ROADMAP.md`

Consultar cuando:

- la tarea mencione una fase;
- se planifique una fase;
- se cierre una fase;
- sea necesario verificar qué funcionalidad pertenece al alcance actual.

No leer `ROADMAP.md` para bugs o cambios pequeños que no dependan de una fase.

---

## Arquitectura

- El dominio no importa Next.js, Prisma ni SDKs externos.
- Las dependencias apuntan hacia el dominio.
- Los casos de uso dependen de contratos o puertos, no de Prisma.
- Los adaptadores de infraestructura implementan esos contratos.
- La presentación no accede directamente a Prisma.
- No colocar reglas de negocio en componentes de UI.
- No introducir microservicios ni multi-tenancy salvo requerimiento explícito.

Server Actions y Route Handlers:

1. autentican y autorizan cuando corresponda;
2. validan entradas;
3. invocan casos de uso;
4. transforman resultados en respuestas o redirecciones.

---

## Reglas permanentes

- Los importes se representan en centavos enteros.
- Las fechas persistidas se guardan en UTC.
- Toda unidad vendible es una `ProductVariant`.
- El stock pertenece a la variante.
- El servidor valida nuevamente precios, stock, permisos, estados y datos sensibles.
- La presentación no decide de forma autoritativa precios, descuentos, stock, permisos, estados ni costos de envío.
- Los pedidos conservan snapshots de la información histórica necesaria.
- La información con valor histórico se conserva mediante estados o archivo lógico cuando corresponda.

---

## Inventario

Los cambios físicos de stock deben:

- usar la lógica de inventario existente;
- mantener las invariantes;
- registrar `InventoryMovement`;
- actualizar stock y movimiento dentro de la misma transacción.

Las reservas de stock no representan movimientos físicos.

No modificar directamente `Inventory` desde presentación.

---

## Base de datos

PostgreSQL es la fuente de verdad persistente.

Prisma es un detalle de infraestructura.

Para cambios de esquema:

- crear una migración nueva;
- nunca modificar una migración ya aplicada;
- conservar constraints e índices existentes salvo razón explícita.

No crear migraciones si la tarea no modifica el esquema.

No modificar `seed.ts` salvo que sea realmente necesario.

---

## Seguridad

Validar entradas en servidor.

Los secretos solamente se obtienen mediante variables de entorno.

Nunca incluir en logs:

- contraseñas;
- tokens;
- cookies;
- firmas;
- secretos;
- credenciales;
- payloads personales completos.

La autorización se verifica en servidor.

Ocultar elementos de UI no reemplaza una comprobación de permisos.

No confiar en IDs enviados por el cliente para determinar ownership.

Conservar las reglas de idempotencia existentes en operaciones sensibles.

---

## Control de alcance

Implementar solamente lo solicitado.

No hacer refactors oportunistas.

No corregir código no relacionado solamente porque podría mejorarse.

No reorganizar carpetas sin necesidad.

No renombrar elementos fuera del alcance solicitado.

No actualizar dependencias salvo necesidad real.

No reformatear archivos completos cuando basta modificar una sección.

No introducir nuevas librerías si la funcionalidad puede resolverse razonablemente con las dependencias existentes.

No implementar funcionalidades pertenecientes a fases posteriores.

Si aparece una mejora no necesaria para completar la tarea, no implementarla.

Si la solución requiere ampliar significativamente el alcance solicitado, explicar primero la dependencia adicional antes de realizar ese trabajo.

---

## Contexto y búsquedas

Preferir búsquedas concretas por:

- función;
- componente;
- clase;
- tipo;
- ruta;
- modelo;
- permiso;
- texto visible;
- error exacto.

Evitar inspeccionar carpetas completas sin necesidad.

No leer `node_modules` salvo que una regla específica de Next.js requiera consultar su documentación.

Cuando sea necesario consultar documentación de Next.js, leer únicamente la guía directamente relacionada con la API o característica modificada.

---

## Cambios locales

No sobrescribir ni revertir cambios locales existentes que no pertenezcan a la tarea.

Si existen cambios locales relacionados, comprenderlos antes de modificar esas líneas.

Preservar la intención del código existente siempre que sea posible.

Si existe un conflicto real, informarlo.

---

## Validación proporcional

### Límite de tests durante tareas Codex

Durante una tarea de desarrollo, ejecutar como máximo 10 tests dirigidos al comportamiento modificado.

No ejecutar `npm test` ni toda la suite local desde Codex salvo instrucción explícita del usuario.

La suite completa, lint, typecheck y build globales se delegan preferentemente al workflow de GitHub CI después del push.

Si no existen tests suficientemente dirigidos, ejecutar el subconjunto mínimo disponible y reportarlo; no ampliar automáticamente a toda la suite.

### Cambio visual o textual pequeño

Ejemplos:

- CSS;
- Tailwind;
- textos;
- espaciado;
- iconos;
- markup sin lógica.

No ejecutar automáticamente todos los tests ni el build completo.

### Cambio TypeScript localizado

Ejecutar preferentemente:

`npm run typecheck`

Agregar lint o tests solamente cuando sean relevantes.

### Cambio de lógica de negocio

Ejecutar:

- tests directamente relacionados;
- `npm run typecheck`.

No ejecutar todos los tests si existe una prueba específica para el comportamiento modificado.

### Cambio de Prisma o persistencia

Ejecutar solamente las validaciones relacionadas con:

- schema;
- migración;
- repositorio afectado;
- tests relacionados.

### Autenticación, autorización o seguridad

Ejecutar:

- tests relacionados;
- typecheck;
- validaciones necesarias para comprobar permisos o sesiones.

### Cambio transversal

Si afecta varios módulos o infraestructura central, ampliar las validaciones según el impacto real.

---

## Validación completa

## Validación completa

La validación completa del repositorio se delega preferentemente a GitHub CI.

Codex no debe ejecutar automáticamente `npm test` ni toda la suite local al cerrar una fase.

Durante el trabajo local:
- máximo 10 tests dirigidos;
- typecheck cuando corresponda;
- lint solamente si es relevante;
- Prisma/migraciones si fueron modificados.

Después del push, GitHub CI valida:
- lint;
- typecheck;
- suite completa;
- build.

Solo ejecutar la matriz completa localmente si el usuario lo solicita explícitamente o si GitHub CI no puede realizarla.

---

## Fallos de validación

Si una validación falla:

1. determinar si el fallo está relacionado con el cambio;
2. corregirlo si pertenece al alcance;
3. volver a ejecutar solamente la comprobación necesaria.

No repetir ciclos de build, tests o análisis sin obtener nueva información.

Si el fallo:

- ya existía;
- pertenece al entorno;
- depende de un servicio externo;
- depende de configuración local;
- o no está relacionado con la tarea;

reportarlo en lugar de realizar cambios especulativos.

---

## Tests

Agregar o modificar tests cuando:

- se agrega una regla de negocio;
- se corrige un bug reproducible;
- cambia un caso de uso;
- cambia una condición de seguridad;
- cambia comportamiento importante de persistencia.

Preferir tests dirigidos al comportamiento modificado.

No agregar tests triviales solamente para aumentar cobertura.

---

## Documentación

No actualizar documentación por cada cambio pequeño.

Actualizarla cuando:

- cambia una decisión arquitectónica;
- cambia el modelo de datos;
- cambia una regla funcional importante;
- se incorpora una capacidad nueva;
- se completa o modifica una fase.

Modificar únicamente las secciones necesarias.

---

## Git

No realizar automáticamente:

- `git commit`;
- `git push`;
- merge;
- rebase;
- reset;
- deploy.

Realizarlos solamente cuando sean solicitados explícitamente.

No revertir cambios del usuario.

---

## Finalización

Al terminar informar brevemente:

1. qué se modificó;
2. archivos principales afectados;
3. validaciones ejecutadas;
4. errores o validaciones pendientes.

No generar informes extensos salvo que se soliciten.

---

## Principio general

Antes de leer un archivo, ejecutar un comando o ampliar el alcance, evaluar si realmente es necesario para resolver o validar la tarea actual.

Preferir:

`buscar -> leer lo mínimo -> modificar -> validar lo necesario -> finalizar`

sobre:

`explorar todo -> leer toda la documentación -> modificar -> ejecutar todo -> investigar todo`

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->