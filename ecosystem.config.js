module.exports = {
  apps: [
    {
      name: 'bot-meta',
      script: './src/app.ts',
      interpreter: 'node',
      node_args: '-r tsx/cjs --max-old-space-size=4096',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: '1G',
      // D13: cada línea de los logs de PM2 lleva fecha y hora (antes no tenían, y no se podía ubicar un error en el tiempo).
      // Aplica al reiniciar con `pm2 delete bot-meta && pm2 start ecosystem.config.js && pm2 save`.
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
