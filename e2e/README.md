# E2E públicos (F15A / F15B)

Un smoke de Chromium verifica home → Productos y el render del catálogo usando
la UI real. No requiere productos específicos: admite el catálogo vacío. No crea
cuentas, fixtures, pedidos ni pagos, ni modifica la base de datos.

F15B agrega tres tests independientes con sesiones de invitado aisladas:

- Catálogo → ficha → carrito: producto público disponible descubierto por UI,
  cantidad, contador y total contrastado con el precio de la ficha.
- Persistencia al navegar y recargar; eliminación y carrito vacío tras recarga.
- Responsive a 390 × 844: home, menú mobile, catálogo, ficha y carrito;
  controles y CTA visibles, dentro del ancho disponible y accionables.

Requieren al menos un producto público con su variante predeterminada disponible.
La ficha actual no expone selector de variantes; se prueba la predeterminada.
No se fijan IDs, nombres ni precios comerciales. El carrito completo se abre por
su ruta pública `/carrito`, porque el drawer no ofrece un enlace a esa página.
Cada test elimina su línea mediante UI al finalizar, incluso si falla; si el
entorno deja de responder, la limpieza falla explícitamente. Pueden quedar
carritos invitados vacíos, pero no se crean productos, cuentas ni pedidos.
No se entra a checkout ni se alteran stock físico, pagos o emails.

## Ejecución local

1. Instalar dependencias con `npm ci`.
2. Instalar Chromium con `npx playwright install chromium` (en Linux puede
   requerirse `npx playwright install --with-deps chromium`).
3. Configurar la app con una `MONGODB_URI` de desarrollo/pruebas accesible y su
   esquema ya preparado. Next.js carga los archivos `.env` habituales. No usar
   producción ni ejecutar seed o `db:push` como parte del smoke.
4. Ejecutar `npm run test:e2e`, o `npm run test:e2e:ui` para el modo interactivo.

Sin `E2E_BASE_URL`, Playwright inicia y detiene `next dev` en
`http://127.0.0.1:3100`. El puerto debe estar libre y no debe haber otro `next dev`
usando el mismo directorio `.next`. No se reutilizan servidores implícitamente.

Para una app ya levantada en un entorno de pruebas, definir `E2E_BASE_URL` en el
entorno del comando; en PowerShell, por ejemplo:

```powershell
$env:E2E_BASE_URL = "https://staging.tecnoclean.shop"
npm run test:e2e
Remove-Item Env:E2E_BASE_URL
```

Con esta variable no se inicia ningún servidor. Permite probar también una URL
externa de pruebas sin acoplar la configuración a staging. No ejecutar contra
producción.

Vitest conserva `tests/**/*.test.ts`; Playwright descubre sólo `e2e/**/*.spec.ts`.
`npm test` mantiene su comportamiento. Los retries (2) sólo se habilitan con
`CI`. Traces, screenshots y videos se conservan únicamente en fallos, dentro de
`test-results/`, ignorado por Git y limpiado por Playwright al iniciar otra corrida.

## CI

Home, layout y catálogo consultan MongoDB mediante Prisma. El workflow actual sólo
declara una URI local para validación/build; no provisiona MongoDB ni un entorno
E2E aislado. La suite sigue siendo manual/local y no es un check obligatorio de
PR, porque staging es externo. Integrarla a CI requiere un entorno de pruebas
aislado en una etapa posterior; no forma parte de F15B.
