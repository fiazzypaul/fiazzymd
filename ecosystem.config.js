module.exports = {
  apps: [
    {
      name: 'FiazzyMD',
      script: 'index.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env_production: {
        NODE_ENV: 'production'
      }
    }
  ]
};