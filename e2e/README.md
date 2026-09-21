# E2E inicial (F15A)

Un smoke de Chromium verifica home → Productos y el render del catálogo usando
la UI real. No requiere productos específicos: admite el catálogo vacío. No crea
cuentas, fixtures, pedidos ni pagos, ni modifica la base de datos.

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
$env:E2E_BASE_URL = "http://127.0.0.1:3000"
npm run test:e2e
Remove-Item Env:E2E_BASE_URL
```

Con esta variable no se inicia ningún servidor. Permite probar también una URL
externa de pruebas sin acoplar la configuración a staging ni producción.

Vitest conserva `tests/**/*.test.ts`; Playwright descubre sólo `e2e/**/*.spec.ts`.
`npm test` mantiene su comportamiento. Los retries (2) sólo se habilitan con
`CI`. Traces, screenshots y videos se conservan únicamente en fallos, dentro de
`test-results/`, ignorado por Git y limpiado por Playwright al iniciar otra corrida.

## CI pendiente para F15B

Home, layout y catálogo consultan MongoDB mediante Prisma. El workflow actual sólo
declara una URI local para validación/build; no provisiona MongoDB ni un entorno
E2E aislado. Por eso este smoke no se agrega como ejecución obligatoria de CI.
F15B debe preparar ese entorno antes de integrar la ejecución, sin simular el
catálogo ni depender de secretos o datos comerciales en F15A.
