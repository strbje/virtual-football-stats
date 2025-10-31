// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "virtual-football-stats",
      cwd: "/home/strbje/virtual-football-stats",

      // запускаем сам next в режиме prod
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",

      // окружение
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        // DATABASE_URL и прочее лежат в .env в cwd — next их подхватит
      },

      // устойчивость
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      min_uptime: "5s",
      max_restarts: 10,
      restart_delay: 3000,             // пауза между рестартами
      exp_backoff_restart_delay: 5000, // защитит от «рестарт-лупа»
      kill_timeout: 5000,
      listen_timeout: 8000,

      // память/GC (полезно на слабых VM)
      node_args: "--max-old-space-size=1024",

      // логи
      out_file: "/home/strbje/.pm2/logs/virtual-football-stats.out.log",
      error_file: "/home/strbje/.pm2/logs/virtual-football-stats.err.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      time: true,

      // не нужно слежение за файлами на проде
      watch: false,
    },
  ],
};
