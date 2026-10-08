# Operación del bot en el Droplet

Guía rápida para reiniciar, actualizar y diagnosticar `bot-meta` en producción.

## Reiniciar el bot (sin cambios de código)

```bash
pm2 restart bot-meta --update-env
```

Usa siempre `--update-env`. Sin ese flag, PM2 conserva las variables de entorno que tenía al arrancar y
cualquier cambio en `.env` (interruptores como `LISTA_ESPERA_CASCADA_ENABLED`, nombres de plantillas,
etc.) no se aplica.

`pm2 restart` reutiliza la configuración con la que se creó el proceso (incluido `-r tsx/cjs`). Si el
proceso no se creó desde `ecosystem.config.js`, el restart no lo arregla: usa el reinicio completo de
más abajo.

Para confirmar que quedó bien:

```bash
pm2 describe bot-meta | grep -Ei "status|restarts|exec mode|node args"
pm2 logs bot-meta --lines 50 --nostream
```

Debe decir `online`, `fork_mode` y `node args` con `-r tsx/cjs --max-old-space-size=4096`.

## Actualizar a la última versión y reiniciar

```bash
cd /opt/proyectos/chatbot-meta-ts
git pull
npm install --include=dev
pm2 restart bot-meta --update-env
```

`--include=dev` es necesario: `tsx`, que ejecuta `src/app.ts`, es una dependencia de desarrollo. Si el
servidor tiene `NODE_ENV=production`, un `npm install` simple la borra y el bot no arranca.

Si `git pull` falla con un error de "local changes would be overwritten" sobre algún archivo `.json` dentro de `src/utils/` o `src/services/`, es porque ese archivo lo escribe el bot en tiempo real (métricas, sesiones, estado del kill-switch, etc.) y quedó versionado por error. Solución:

```bash
mv <archivo_con_conflicto> /tmp/backup_temp.json
git pull
mv /tmp/backup_temp.json <archivo_con_conflicto>
```

Y de paso avisa para agregarlo a `.gitignore` y sacarlo del repo de forma definitiva (`git rm --cached`), así no vuelve a pasar.

## Ver logs

```bash
pm2 logs bot-meta --lines 100
```

## Ver estado y confirmar que corre sano

```bash
pm2 status
```

La columna `status` debe decir `online` y mantenerse así (no `waiting restart`, no reiniciándose en bucle). Si algo se ve raro:

```bash
pm2 describe bot-meta
```

Revisa ahí especialmente:
- `exec mode` → debe decir **`fork_mode`**, nunca `cluster_mode` (el bot mantiene sesiones y colas en memoria; con más de un proceso se duplicarían respuestas y campañas).
- `restarts` → un número que sube solo indica que el proceso se está cayendo y reiniciando repetidamente.

## Logs con fecha y hora

`ecosystem.config.js` define `log_date_format: 'YYYY-MM-DD HH:mm:ss Z'` y cada línea de `pm2 logs` empieza con fecha y hora. Solo aplica tras un reinicio completo (un `pm2 restart` no relee el archivo), con el procedimiento de la sección siguiente.

## Reinicio completo desde cero (si `pm2 restart` no basta)

```bash
cd /opt/proyectos/chatbot-meta-ts
pm2 delete bot-meta
pm2 start ecosystem.config.js
pm2 save
pm2 status
```

- Hay que estar en `/opt/proyectos/chatbot-meta-ts`: `ecosystem.config.js` usa rutas relativas.
- Arranca siempre con `pm2 start ecosystem.config.js`, **nunca** con `pm2 start src/app.ts`. Solo el
  ecosystem carga `-r tsx/cjs` y fija `exec_mode: 'fork'`.
- El `.env` se vuelve a leer al arrancar, así que no se pierde ninguna variable.
- `pm2 save` guarda la lista de procesos para que sobrevivan a un reinicio del servidor (droplet).

Úsalo cuando:
- `pm2 restart` no basta;
- en los logs aparece `SyntaxError: Cannot use import statement outside a module` (el proceso corre sin
  `-r tsx/cjs`);
- `pm2 describe bot-meta` muestra `node args` vacío o `cluster_mode`.

Si el bot sigue sin arrancar, revisa que `tsx` esté instalado:

```bash
ls node_modules/tsx/package.json || npm install --include=dev
```

## Limpiar los logs

```bash
pm2 flush bot-meta
```

Vacía `/root/.pm2/logs/bot-meta-out-0.log` y `bot-meta-error-0.log`. No afecta al bot. Sirve para que,
al diagnosticar, solo aparezcan errores nuevos (esos archivos acumulan errores de arranques anteriores).

## Ajustar memoria u otros flags de Node

Edita `ecosystem.config.js` (no hace falta tocar el comando de arranque), luego:

```bash
pm2 delete bot-meta
pm2 start ecosystem.config.js
pm2 save
```

## Payload de confirmación de recordatorios (Fase 3)

`RECORDATORIOS_PAYLOAD_ENABLED` debe permanecer en `false` hasta revisar en Meta Business Manager el índice real de los botones de las cuatro plantillas de recordatorio y probar primero con un teléfono incluido en `LISTA_ESPERA_TELEFONOS_PILOTO`. Al cambiarlo, reinicia con `pm2 restart bot-meta --update-env`. Las respuestas de cancelar y no asistencia siguen pasando por documento y confirmación explícita.

## Oferta de cupo con un toque (lista de espera, Fase 2)

Detalle completo en `proyecto-ips/docs/features/2026-10-07-lista-espera-aceptacion-y-escalamientos.md` (sección 6).

- `LISTA_ESPERA_OFERTA_PAYLOAD_ENABLED=false` (default): la oferta sale y se responde como siempre (documento). Encender solo tras probar con un teléfono piloto (`LISTA_ESPERA_TELEFONOS_PILOTO`) que el id del payload coincide con el botón tocado: orden de la plantilla `cita_disponible_lista_espera` = 0 *Sí, lo tomo*, 1 *No puedo*, 2 *Hablar con un agente*.
- Encendido, "Sí, lo tomo" muestra los datos del cupo con los botones *Sí, adelantar* / *No, dejar así*. Si algo falla con el id (sin payload, ilegible, oferta no encontrada, celular distinto, varias ofertas, error del backend) el bot pide el documento; el motivo queda en `chat_stats` como `resultado='fallback_documento'` (`metadata.motivo`). Un pico de `sin_payload` indica que Meta no está mandando el id.
- `LISTA_ESPERA_PREGUNTA_POST_RECHAZO=false` (default): con `true`, tras rechazar pregunta si sigue en la lista (*Sí, seguir* / *No, gracias*).
- Requiere el backend de la Fase 2 (migración 040, `LISTA_ESPERA_PRORROGA_ACEPTACION_MIN=10`). Un backend anterior no manda `oferta_id` en la acción y la plantilla sale sin payload.
- `ALERTA_CRISIS_CANAL=whatsapp` (default): con `email`, la alerta de crisis sale solo por correo desde el backend (teléfono completo, nunca el texto del paciente) y ya no se manda el WhatsApp al asesor. Antes de encenderlo, probar el correo desde el droplet: `docker-compose exec backend node dist/scripts/enviar-correo-prueba.js`. Si el backend no recibe la alerta tras 3 intentos, el bot lo deja en el log (`ALERTA DE CRISIS NO REGISTRADA`) y en `chat_stats` como `aviso_crisis_fallido`; el número queda bloqueado de todos modos.
- Recordatorio único de invitación (D12): `LISTA_ESPERA_INVITACION_RECORDATORIO_LIMITE` (default 50 por ejecución). El backend lo activa con `LISTA_ESPERA_INVITACION_RECORDATORIO_HORAS` (default 0 = apagado).

La plantilla interna de escalamiento queda desactivada mientras `NOMBRE_PLANTILLA_AVISO_ESCALAMIENTO` esté vacío. Después de crearla y aprobarla en Meta (Utility, `es_CO`, cuatro variables), configura el nombre y reinicia el proceso. Si falla el envío de plantilla, el bot intenta una vez el mensaje de texto libre.
