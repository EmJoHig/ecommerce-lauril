# Operación de Lauril Ecommerce

## Antes de desplegar checkout exclusivamente autenticado

Visitantes conservan navegación y carrito; confirmar Order e iniciar Mercado Pago
requieren customer autenticado y activo. No se reasignan pedidos guest históricos.

En la consola MongoDB autorizada de producción, sobre la base de la aplicación,
ejecutar esta consulta de sólo lectura y registrar el conteo:

```javascript
db.orders.countDocuments({
  customer_id: null,
  status: "PENDING_PAYMENT",
  payment_expires_at: { $gt: new Date() }
})
```

Si el resultado es mayor que cero, requieren una decisión operativa antes del
deploy o esperar su expiración automática y verificar nuevamente. No asociarlos
silenciosamente a cuentas. Esta consulta no fue ejecutada desde Codex.
La lectura histórica se conserva, pero el token guest no inicia nuevos pagos.
Los enlaces de Mercado Pago emitidos previamente no son revocados por este cambio;
su tratamiento sigue en el webhook autoritativo y la lógica existente de pago tardío.

## Referencias de producción

- Repositorio en el VPS: `/root/ecommerce-lauril`.
- Rama productiva: `main`.
- Proceso PM2 de la aplicación: `lauril-ecommerce`.
- Comando efectivo del proceso PM2: `npm start`.
- Health check: `/api/health`.
- Job de expiración: `npm run db:expire-orders`.
- Servicio systemd: `lauril-expire-orders.service`.
- Timer systemd: `lauril-expire-orders.timer`.

Los comandos de este runbook se ejecutan en el VPS de producción con permisos
de root. PM2 administra la aplicación; systemd ejecuta el job de expiración.
Staging no usa este timer de producción: sus validaciones de expiración se
ejecutan por separado en su propio entorno.

## Consultar estado y logs

```bash
cd /root/ecommerce-lauril
pm2 status lauril-ecommerce
pm2 logs lauril-ecommerce --lines 100 --nostream
```

Consultar el health check usando el dominio HTTPS de producción:

```bash
curl --fail --show-error --silent https://tecnoclean.shop/api/health
```

Comprobar la respuesta del endpoint junto con el estado y los logs de PM2.

```bash
systemctl status lauril-expire-orders.timer
systemctl list-timers --all | grep lauril-expire-orders
systemctl status lauril-expire-orders.service
journalctl -u lauril-expire-orders.service
```

Para acotar los logs del job o seguir las próximas ejecuciones:

```bash
journalctl -u lauril-expire-orders.service --since "30 minutes ago" --no-pager
journalctl -u lauril-expire-orders.service -f
```

El servicio es `oneshot`: puede figurar inactivo después de completar una
ejecución correctamente. Revisar el resultado y los logs, además de confirmar
que el timer permanece activo y tiene una próxima ejecución programada.
`expired: 0` es un resultado válido cuando no hay pedidos elegibles para expirar.

## Expiración programada

El timer activa el servicio aproximadamente cada cinco minutos. `OnBootSec=2min`
programa la primera activación a los dos minutos del arranque. Si el timer se
habilita cuando el servidor ya lleva más de dos minutos encendido, systemd puede
disparar la primera ejecución inmediatamente. Las siguientes toman como
referencia la última activación del servicio. `AccuracySec=30s` permite una
ventana de precisión de 30 segundos; no es un cron alineado al reloj.

El servicio ejecuta `npm run db:expire-orders` desde el repositorio de producción.
`flock -n` obtiene un bloqueo exclusivo sobre `/run/lauril-expire-orders.lock`
sin esperar: si ya está ocupado, omite esa ejecución con código 75.
`SuccessExitStatus=75` trata esa omisión como un resultado aceptado por systemd.
La exclusión cubre las invocaciones que usan el mismo archivo de bloqueo;
ejecutar `npm run db:expire-orders` directamente no adquiere ese bloqueo.

Para una ejecución manual en producción que conserve la configuración y el
bloqueo del servicio:

```bash
systemctl start lauril-expire-orders.service
journalctl -u lauril-expire-orders.service -n 100 --no-pager
```

### Definiciones de referencia

La ruta de Node/npm corresponde a la instalación de producción indicada. Si se
actualiza Node, revisar tanto `Environment` como `ExecStart` antes de recargar
las unidades.

```ini
# /etc/systemd/system/lauril-expire-orders.service
[Unit]
Description=Lauril - Expirar pedidos pendientes
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=root
WorkingDirectory=/root/ecommerce-lauril
Environment="PATH=/root/.nvm/versions/node/v22.23.2/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
ExecStart=/usr/bin/flock -n -E 75 /run/lauril-expire-orders.lock /root/.nvm/versions/node/v22.23.2/bin/npm run db:expire-orders
SuccessExitStatus=75
```

```ini
# /etc/systemd/system/lauril-expire-orders.timer
[Unit]
Description=Lauril - Ejecutar expiración de pedidos cada 5 minutos

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
AccuracySec=30s
Unit=lauril-expire-orders.service

[Install]
WantedBy=timers.target
```

Después de instalar o modificar estas unidades, recargar la configuración de
systemd y habilitar el timer:

```bash
systemctl daemon-reload
systemctl enable --now lauril-expire-orders.timer
systemctl status lauril-expire-orders.timer
```

### Deshabilitar temporalmente y reactivar

Detener el timer y evitar que se active automáticamente en el próximo arranque:

```bash
systemctl disable --now lauril-expire-orders.timer
```

Esto no interrumpe una ejecución del servicio que ya esté en curso ni impide
iniciarlo manualmente. Durante la pausa no se programan nuevas expiraciones
automáticas desde este timer; comprobar el servicio y sus logs.

Reactivar la programación al finalizar la intervención:

```bash
systemctl enable --now lauril-expire-orders.timer
systemctl status lauril-expire-orders.timer
systemctl list-timers --all | grep lauril-expire-orders
```

## Reconciliación de pagos: propuesta pendiente de instalación

**El timer `lauril-reconcile-payments.timer` NO está instalado ni activo por este
cambio.** Esta sección prepara una operación posterior manual; no modifica el VPS.

El job concilia la confirmación de pagos pendientes (pending payment settlement).
El progreso entre corridas se conserva en MongoDB mediante
`PaymentReconciliationCheckpoint`; no requiere cursor manual ni memoria del
proceso. La prueba de 150 candidatos confirma que, tras 100 errores persistentes,
la siguiente corrida alcanza las otras 50 aprobaciones.

El webhook es el mecanismo primario. Proponemos una corrida cada **10 minutos**,
con gracia de **5 minutos**, páginas de **25** y máximo **100** intentos secuenciales
por corrida. Es una red de seguridad, evita competir con startPayment y no agrega
tráfico cada minuto. A lo sumo realiza 100 GET por corrida, más los auto-refunds
tardíos que determine la lógica existente. Usa configuración Mercado Pago/DB
existente, sin variables nuevas. El modelo nuevo requiere la sincronización de
schema indicada abajo antes de la activación futura.

Selecciona `CREATED/PENDING` de Mercado Pago por `(updatedAt, id)` ascendente.
Excluye terminales y `REQUIRES_REVIEW`. No puede recuperar automáticamente un
intento sin recurso externo: registra skip sin cambiarlo. Consultar las garantías
y limitaciones en [PAYMENTS.md](PAYMENTS.md#reconciliación-periódica-de-mercado-pago).

Ejecución manual en el entorno elegido y con su configuración ya verificada:

```bash
npm run db:reconcile-payments
```

Requiere `MONGODB_URI`, `MERCADO_PAGO_ENABLED=true`, `MERCADO_PAGO_ACCESS_TOKEN`
y `APP_URL` existentes. No es dry-run: puede confirmar ventas y solicitar el
auto-refund tardío existente. Las pruebas de desarrollo ejecutan el script con
DB/gateway simulados, nunca contra producción.

Cada intento emite JSON con `source: "reconciliation"`, `paymentAttemptId`,
`outcome` y, cuando corresponde, `reasonCode`. No registra PII, tokens, firmas,
payloads ni mensajes crudos de excepciones. Ejemplo de resumen:

```json
{"job":"mercado-pago-reconciliation","status":"ok","scanned":4,"reconciled":1,"unchanged":1,"skipped":1,"requiresReview":1,"failed":0,"nextCursor":null,"cycleCutoff":"2026-09-27T12:00:00.000Z","cycleCompleted":true,"checkpointAdvanced":true,"checkpointConflict":false,"checkpointVersion":5}
```

Los contadores son excluyentes: `reconciled` incluye aprobación, rechazo,
cancelación o refund; `unchanged` corresponde a pendiente/duplicado; `skipped`
a falta de recurso o cambio concurrente; `requiresReview` a incoherencia o pago
tardío; `failed` a un error individual recuperable. Todos suman `scanned`.
`unchanged` no implica ausencia de actualización de metadata del proveedor.

Errores individuales de GET o conflictos permiten seguir con el siguiente.
`failed > 0` produce `status: "partial"` y exit 1. Fallos de consulta DB,
configuración, autenticación del proveedor, rate limit o errores inesperados
detienen la corrida, imprimen `status: "error"` y devuelven exit 1; los logs por
intento anteriores conservan el progreso. No hay retry HTTP agresivo. Prisma se
desconecta en `finally`. Revisar logs y credenciales/configuración sin publicarlas;
tras corregir la causa puede repetirse la corrida con seguridad.
Los fallos globales distinguen `reasonCode: "configuration_failed"` (argumentos,
variables o carga de configuración) de `"execution_failed"` sin revelar valores.
Importar el script no ejecuta el job: sólo el entrypoint CLI o una llamada explícita
a `runReconciliationJob` lo inicia.

### Ciclos y checkpoint persistente

El comando normal sin argumentos crea o lee un único checkpoint con ID
`mercado-pago-reconciliation`. Al abrir ciclo fija `cycleCutoff = now - 5 minutos`
y cursor nulo. Las corridas intermedias conservan ese cutoff y continúan después
de `(cursorUpdatedAt, cursorId)`, sin offsets. Al no encontrar más candidatos,
un CAS cierra el ciclo dejando cutoff/cursor nulos. Termina esa ejecución: sólo
la siguiente abre otro ciclo con un nuevo cutoff. Si el límite de 100 coincide
exactamente con el final, una corrida posterior puede cerrar el ciclo con cero
visitas; nunca abre y recorre otro ciclo inmediatamente.

Después de cada candidato evaluado persiste su cursor con `updateMany` por ID y
versión esperada, incrementando la versión. Visitado no significa pago exitoso:
avanza también sobre unchanged, revisión, skips y errores individuales (404,
5xx, timeout/red). Los fallidos que sigan CREATED/PENDING se reintentan al volver
a pasar por ellos en un ciclo posterior. Se conserva la selección de intentos
sin recurso para mantener su visibilidad operativa: producen skip sin mutar el
PaymentAttempt y ya no pueden bloquear a los siguientes ciclos/candidatos.

401/403, 429, configuración inválida o fallo global DB detienen la ejecución.
Los avances previos persisten; el candidato cuyo procesamiento fue interrumpido
no se adelanta. Si el proceso cae después de confirmar un pago pero antes de
guardar progreso, la próxima corrida puede repetir lecturas: las guardas de pago
mantienen una única venta. No existe transacción distribuida entre MP y checkpoint.

Si pierde un CAS, relee el checkpoint vigente y termina con
`checkpointConflict: true`, sin sobrescribir el cursor ajeno ni reintentar en
loop. Ese solapamiento no es un error global; conserva exit 1 si hubo fallos
individuales. La versión nunca se reinicia al cerrar/abrir ciclos.

`cycleCutoff` indica el límite de la corrida/ciclo; `cycleCompleted` confirma que
esta corrida cerró el ciclo; `checkpointAdvanced` indica que consiguió guardar
al menos una transición del checkpoint (visita, apertura o cierre).
`checkpointVersion` muestra la versión guardada u observada tras conflicto;
`nextCursor` queda como diagnóstico, no debe copiarse manualmente. La opción
anterior `--after` se retiró para que ninguna invocación normal omita el checkpoint.

### Preparación futura de base de datos

Cambio de schema: colección `payment_reconciliation_checkpoints`, una fila por
identidad fija de job/proveedor, con cutoff, cursor, versión y timestamp operativo.
No modifica PaymentAttempt ni guarda PII/secretos. Su clave primaria es suficiente;
no requiere nuevos índices parciales. Se conserva el índice de intentos
`(status, updatedAt)`; no se agregó un índice compuesto sin evidencia de necesidad.
Verificar el plan de consulta y el costo del sort por id en staging con volumen
representativo antes de producción; no hay un índice adicional demostrado como
requisito de esta implementación.

En el despliegue futuro, un operador deberá regenerar Prisma Client con
`npx prisma generate` y aplicar `npm run db:push` en el entorno autorizado (incluye
la verificación idempotente de índices existentes). Validar primero en staging.
MongoDB no utiliza Prisma Migrate; no hay migración SQL ni seed nuevo. No crear
manualmente el checkpoint: la primera corrida lo inicializa con unicidad por ID
y resuelve creaciones concurrentes. En este trabajo sólo se ejecutó generate;
no se hizo db push ni cambios de datos en producción.

### Relación con la expiración

Conviene ejecutar **reconcile primero y expire después** cuando se coordinan
ambos jobs: reduce cancelaciones de pagos ya aprobados cuyo webhook se perdió.
No elimina la carrera ni garantiza procesar todo un backlog antes de expirar.
El timer de expiración existente corre cada cinco minutos: el nuevo timer aislado
no lo ordena ni lo bloquea. Una futura coordinación debe usar el mismo lock
`/run/lauril-expire-orders.lock` y secuenciar ambas corridas en un wrapper revisado,
manteniendo la frecuencia de expiración necesaria. No activar sólo un `After=`
esperando que ordene timers independientes. Este cambio no modifica expire-orders
ni instala esa coordinación. Si expire gana, aplica el auto-refund tardío existente;
revisar sus estados `CREATED/SUBMITTED/REQUIRES_REVIEW` como indica PAYMENTS.

### Unidades de referencia para instalación futura

Verificar ruta de Node y entorno antes de copiar estos ejemplos. El lock evita
solapamientos entre invocaciones que lo compartan; la integridad también se
mantiene cuando alguien ejecuta el comando directamente. `flock` evita overlap
normal en el VPS; el CAS del checkpoint protege progreso entre procesos incluso
si no comparten ese lock. No es un lock distribuido del proveedor.

```ini
# /etc/systemd/system/lauril-reconcile-payments.service
[Unit]
Description=Lauril - Reconciliar Mercado Pago
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=root
WorkingDirectory=/root/ecommerce-lauril
Environment="PATH=/root/.nvm/versions/node/v22.23.2/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
ExecStart=/usr/bin/flock -n -E 75 /run/lauril-reconcile-payments.lock /root/.nvm/versions/node/v22.23.2/bin/npm run db:reconcile-payments
SuccessExitStatus=75
TimeoutStartSec=45min
```

```ini
# /etc/systemd/system/lauril-reconcile-payments.timer
[Unit]
Description=Lauril - Reconciliación de pagos cada 10 minutos

[Timer]
OnBootSec=5min
OnUnitInactiveSec=10min
AccuracySec=30s
Unit=lauril-reconcile-payments.service

[Install]
WantedBy=timers.target
```

`OnUnitInactiveSec` deja diez minutos entre el final de una corrida y la siguiente.
El timeout contempla hasta 100 GET y sus eventuales auto-refunds secuenciales.
Para una instalación **futura y manual**: validar primero en staging aislado,
sincronizar el schema del checkpoint, revisar backlog y coordinación con
expire-orders, copiar ambas unidades,
validarlas con `systemd-analyze verify`, ejecutar `systemctl daemon-reload` y
recién entonces `systemctl enable --now lauril-reconcile-payments.timer`.
Comprobar `systemctl list-timers --all` y
`journalctl -u lauril-reconcile-payments.service`. Para desactivar:
`systemctl disable --now lauril-reconcile-payments.timer` (no interrumpe una
corrida ya iniciada). **Instalación y activación productivas: PENDIENTES.**

## Backup de base de datos

Registro operativo informado para el cierre productivo del 2026-09-22:

- `npm run db:verify` ejecutado en producción: exitoso.
- Backup lógico creado con `mongodump` el 2026-09-22.
- Archivo: `/root/backups/lauril/lauril_ecommerce-20260922T110809Z.archive.gz`.
- SHA-256: `c4a214897b1734bc0a4979b61048255fb2f045ca4b88d59eb0eb73a792f2ae3f`.
- Permisos del archivo: `600`.
- Integridad con `gzip -t`: correcta.
- Validación con `mongorestore --dryRun`: correcta, 0 fallos.

El dry run no equivale a una restauración real. Antes de una intervención futura,
confirmar que el backup disponible sea suficientemente reciente y esté accesible.
No registrar credenciales ni cadenas de conexión en la documentación o evidencias.

**Un rollback de código no implica restaurar la base de datos.** Una restauración
de MongoDB es una operación de incidente separada: requiere evaluar los datos
posteriores al backup, la compatibilidad y el impacto antes de autorizarla.
No se ejecuta automáticamente como parte de los procedimientos siguientes.

## Deploy productivo

Este procedimiento se ejecuta en el VPS, en `/root/ecommerce-lauril`, después de
que la versión destinada a producción esté integrada y validada en `origin/main`.
No ejecutar estos comandos en el checkout de documentación de `dev`.
Planificar una ventana de mantenimiento: la instalación y el build se realizan
en el mismo directorio que usa la aplicación, sin garantía de cero interrupciones.

1. Revisar `git status --short --untracked-files=no`: debe estar vacío, incluidos
   cambios staged. Si hay cambios tracked, detenerse y resolverlos sin descartarlos.
   Preservar `.env` y los archivos untracked/ignorados en una copia
   privada fuera del repositorio; verificarla sin imprimir secretos. No usar
   `git clean`. Registrar el commit actual con `git rev-parse HEAD`.
2. Obtener ramas y tags con `git fetch origin --tags`, cambiar a `main` y
   actualizarla exclusivamente por fast-forward desde `origin/main`. Si hay
   divergencia, detenerse; no resolverla mediante un reset automático.
3. Instalar dependencias, comprobar tipos, construir y verificar la base de datos.
   Ante cualquier fallo, detener el procedimiento antes del reinicio.
4. Reiniciar el proceso existente de PM2 y realizar todas las comprobaciones
   de la sección de verificación posterior.

Después de completar la preservación previa, ejecutar en Bash. El subshell se
detiene ante errores y comprueba nuevamente la ausencia de cambios tracked:

Next.js puede modificar automáticamente el archivo tracked `next-env.d.ts`
durante `npm run build`. Tanto en deploy como en rollback, después del build se
comprueban los cambios tracked, incluidos los staged, excluyendo sólo ese archivo.
Si aparece cualquier otro cambio, se aborta sin limpiar nada. Sólo entonces se
restaura `next-env.d.ts` con `git restore -- next-env.d.ts` y se exige que el
working tree tracked quede limpio antes de `db:verify` y del reinicio de PM2.
No usar `git restore .`, `git reset --hard` ni `git clean` para limpiar cambios
producidos por el build.

```bash
(
  set -eu
  cd /root/ecommerce-lauril
  test -z "$(git status --porcelain --untracked-files=no)"
  git rev-parse HEAD
  git fetch origin --tags
  git switch main
  git merge --ff-only origin/main
  test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)"
  npm ci
  npm run typecheck
  npm run build
  build_changes=$(git status --porcelain --untracked-files=no -- . ':(top,exclude)next-env.d.ts')
  if [ -n "$build_changes" ]; then
    printf '%s\n' 'Abortado: cambios tracked inesperados después del build.' "$build_changes" >&2
    exit 1
  fi
  git restore -- next-env.d.ts
  tracked_status=$(git status --porcelain --untracked-files=no)
  test -z "$tracked_status"
  npm run db:verify
  pm2 restart lauril-ecommerce
)
```

PM2 conserva la definición existente cuyo comando efectivo es `npm start`.
No crear un segundo proceso. `npm run db:push` **no es un paso automático del
deploy**: sólo se ejecuta cuando existen cambios reales de schema/índices revisados
explícitamente, con su backup y evaluación de compatibilidad correspondientes.
Un fallo de `db:verify` debe investigarse; no dispara `db:push` automáticamente.

## Rollback de código

Punto de rollback remoto validado previo al deploy final de F15:

- Tag: `pre-f15-final-prod-20260922`.
- Commit esperado: `01438d58c0f8e77108f0e04fe7ac0d901439b4e7`.

Antes de cualquier `git reset --hard`, cumplir estas condiciones obligatorias:

1. Confirmar que `git status --short --untracked-files=no` esté vacío. Si hay
   cambios tracked, detenerse; no descartarlos con el reset.
2. Preservar `.env` y todos los archivos untracked/ignorados mediante
   una copia privada fuera de `/root/ecommerce-lauril`. Verificar que la copia
   exista y sea recuperable, manteniendo permisos restrictivos para secretos.
   Revisar posibles colisiones con rutas tracked del commit destino: un reset
   puede sobrescribir archivos untracked que interfieran con ellas. No usar
   `git clean`; no continuar hasta haber confirmado la preservación.
3. Obtener los tags y verificar que el tag resuelva exactamente al commit esperado.
   Si no coincide, detenerse sin ejecutar el reset.
4. Confirmar la compatibilidad del código anterior con la base actual. Si hubo
   cambios incompatibles de schema/índices, detenerse y tratar el incidente por
   separado; no restaurar MongoDB automáticamente.

Sólo después de completar estas condiciones, ejecutar en Bash:

```bash
(
  set -eu
  cd /root/ecommerce-lauril
  test -z "$(git status --porcelain --untracked-files=no)"
  git fetch origin --tags
  test "$(git rev-parse --verify 'refs/tags/pre-f15-final-prod-20260922^{commit}')" = \
    "01438d58c0f8e77108f0e04fe7ac0d901439b4e7"
  git switch main
  test -z "$(git status --porcelain --untracked-files=no)"
  git reset --hard refs/tags/pre-f15-final-prod-20260922
  test "$(git rev-parse HEAD)" = "01438d58c0f8e77108f0e04fe7ac0d901439b4e7"
  npm ci
  npm run typecheck
  npm run build
  build_changes=$(git status --porcelain --untracked-files=no -- . ':(top,exclude)next-env.d.ts')
  if [ -n "$build_changes" ]; then
    printf '%s\n' 'Abortado: cambios tracked inesperados después del build.' "$build_changes" >&2
    exit 1
  fi
  git restore -- next-env.d.ts
  tracked_status=$(git status --porcelain --untracked-files=no)
  test -z "$tracked_status"
  npm run db:verify
  pm2 restart lauril-ecommerce
)
```

Esto deja `main` local temporalmente en el commit del tag. No hacer push forzado
de `main` ni modificar la rama remota como parte del rollback. No ejecutar luego
el deploy habitual hasta decidir qué versión debe volver a producción: actualizar
desde `origin/main` volvería a incorporar el código retirado.

## Verificación posterior al deploy o rollback

Ejecutar después de cualquiera de los dos procedimientos:

```bash
curl --fail --show-error --silent https://tecnoclean.shop/api/health
curl --fail --show-error --silent --output /dev/null --write-out '%{http_code}\n' https://tecnoclean.shop/
curl --fail --show-error --silent --output /dev/null --write-out '%{http_code}\n' https://tecnoclean.shop/productos
pm2 status
pm2 logs lauril-ecommerce --lines 100 --nostream
systemctl is-active lauril-expire-orders.timer
systemctl status lauril-expire-orders.timer
systemctl list-timers --all | grep lauril-expire-orders
journalctl -u lauril-expire-orders.service --since "30 minutes ago" --no-pager
```

Confirmar health satisfactorio y respuestas HTTP 200 en `/` y `/productos`.
Abrir ambas páginas en el navegador para comprobar que home y catálogo rendericen
correctamente. Verificar `lauril-ecommerce` en estado `online`, sin nuevos errores
en los logs recientes. El timer debe continuar `active` y mostrar una próxima
ejecución. Si fue pausado durante la intervención, reactivarlo siguiendo la
sección de expiración programada y verificar su estado.
Si alguna comprobación falla, no declarar exitoso el deploy o rollback.

## Registro operativo y cierre productivo

F15D registra las validaciones controladas en [ROADMAP.md](ROADMAP.md), incluidas
dos ejecuciones automáticas consecutivas del scheduler de producción.

Cierre productivo completado el 2026-09-22 según los resultados operativos
validados. Además del `db:verify` productivo, el backup lógico y el punto de
rollback remoto ya registrados, se ejecutaron y validaron el deploy final y el
smoke posterior:

- Commit desplegado en producción: `34d6cb779627fe45dd977c38860cbfe93366627c`.
- CI de `main` para ese commit: `success`.
- `npm ci`, `npm run typecheck` y `npm run build`: correctos.
- `next-env.d.ts` fue el único archivo tracked modificado por el build y se
  restauró explícitamente. Working tree tracked limpio después del build.
- `npm run db:verify`: correcto. No se ejecutó `npm run db:push` porque no hubo
  cambios de schema ni índices.
- PM2: `lauril-ecommerce` reiniciado correctamente, en estado `online`.
- Health local `/api/health`: OK.
- Health público `https://tecnoclean.shop/api/health`: OK.
- `https://tecnoclean.shop/`: HTTP 200.
- `https://tecnoclean.shop/productos`: HTTP 200.
- Sin errores nuevos en el log de PM2 durante el smoke.
- `lauril-expire-orders.timer`: activo, con próxima ejecución programada
  correctamente.
- Al momento del cierre productivo previo a esta actualización documental,
  `main` y `dev` se encontraban sincronizadas en
  `34d6cb779627fe45dd977c38860cbfe93366627c`.

F15 quedó completada el 2026-09-22. La comprobación final de Mercado Pago confirmó
que la habilitación comercial ya estaba activa en producción:

- `MERCADO_PAGO_ENABLED=true` desde `.env`, sin override de PM2.
- `MERCADO_PAGO_ACCESS_TOKEN` configurado y aceptado por
  `https://api.mercadopago.com/users/me` con HTTP 200.
- `MERCADO_PAGO_WEBHOOK_SECRET` configurado; webhook sin firma válida: HTTP 401.
- Modo productivo del panel configurado exactamente con
  `https://tecnoclean.shop/api/payments/mercado-pago/webhook` y evento
  `Order (Mercado Pago)` seleccionado.
- `https://tecnoclean.shop/api/health`: OK; PM2 `lauril-ecommerce`: online.

La integración real de pago/webhook ya había sido validada previamente de forma
controlada en producción. La verificación final no requirió cambios en variables
de entorno, código, base de datos, PM2 ni configuración de Mercado Pago.

Al registrar evidencias, conservar únicamente resultados operativos necesarios;
no copiar emails de clientes, tokens, secretos, IDs internos de MongoDB o Mercado
Pago ni otros datos sensibles. Revisar y redactar los logs antes de compartirlos.
