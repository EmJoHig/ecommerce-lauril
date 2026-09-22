# Operación de Lauril Ecommerce

## Referencias de producción

- Repositorio en el VPS: `/root/ecommerce-lauril`.
- Proceso PM2 de la aplicación: `lauril-ecommerce`.
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

## Registro operativo y cierre pendiente

F15D registra las validaciones controladas en [ROADMAP.md](ROADMAP.md), incluidas
dos ejecuciones automáticas consecutivas del scheduler de producción.
Este runbook no implica el cierre de F15.

El próximo bloque pendiente es el cierre productivo: backup/verificación de
Atlas, runbook de deploy/rollback, deploy final y smoke posterior.

Al registrar evidencias, conservar únicamente resultados operativos necesarios;
no copiar emails de clientes, tokens, secretos, IDs internos de MongoDB o Mercado
Pago ni otros datos sensibles. Revisar y redactar los logs antes de compartirlos.
