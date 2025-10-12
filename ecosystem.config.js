// ecosystem.config.js
module.exports = {
  apps: [{
    name: "virtual-football-stats",
    cwd: "/home/strbje/virtual-football-stats",
    script: "node_modules/next/dist/bin/next",
    args: "start -p 3000",
    env: {
      NODE_ENV: "production",
      PORT: "3000"
      // при необходимости можно добавить другие переменные окружения
      // DATABASE_URL берётся из .env на сервере
    }
  }]
};
