module.exports = {
  apps: [
    {
      name: 'bot-meta',
      script: './dist/app.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      node_args: '--max-old-space-size=4096',
      max_memory_restart: '1G',
    },
  ],
};
