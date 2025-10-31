module.exports = {
  apps: [
    {
      name: "virtual-football-stats",
      cwd: "/home/strbje/virtual-football-stats",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      env: {
        NODE_ENV: "production",
        PORT: "3000"
        // DATABASE_URL и прочие берутся из ~/.env
      }
    }
  ]
};
