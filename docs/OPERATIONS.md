# Operación de Lauril Ecommerce

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

La habilitación comercial con pagos es una decisión separada, sigue pendiente
de autorización explícita y todavía no fue ejecutada. F15 permanece en curso
únicamente por ese pendiente; el cierre productivo no implica completar la fase.

Al registrar evidencias, conservar únicamente resultados operativos necesarios;
no copiar emails de clientes, tokens, secretos, IDs internos de MongoDB o Mercado
Pago ni otros datos sensibles. Revisar y redactar los logs antes de compartirlos.
