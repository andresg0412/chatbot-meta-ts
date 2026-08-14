module.exports = {
  apps: [
    {
      name: 'bot-meta',
      script: './src/app.ts',
      interpreter: 'node',
      node_args: '-r tsx/cjs --max-old-space-size=4096',
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: '1G',
    },
  ],
};
