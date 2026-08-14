# Operación del bot en el Droplet

Guía rápida para reiniciar, actualizar y diagnosticar `bot-meta` en producción.

## Reiniciar el bot (sin cambios de código)

```bash
pm2 restart bot-meta
```

## Actualizar a la última versión y reiniciar

```bash
cd /opt/proyectos/chatbot-meta-ts
git pull
pm2 restart bot-meta
```

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
pm2 delete bot-meta
pm2 start ecosystem.config.js
pm2 save
pm2 status
```

`pm2 save` guarda la lista de procesos para que sobrevivan a un reinicio del servidor (droplet).

## Ajustar memoria u otros flags de Node

Edita `ecosystem.config.js` (no hace falta tocar el comando de arranque), luego:

```bash
pm2 delete bot-meta
pm2 start ecosystem.config.js
pm2 save
```
