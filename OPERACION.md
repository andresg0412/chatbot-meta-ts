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
