module.exports = {
  apps: [
    {
      name: 'bot-meta',
      script: './src/app.ts',
      interpreter: './node_modules/.bin/tsx',
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: '1G',
      env: {
        NODE_OPTIONS: '--max-old-space-size=4096',
      },
    },
  ],
};
