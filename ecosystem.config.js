module.exports = {
  apps: [
    {
      name: 'virtual-football-stats',
      cwd: '/home/strbje/virtual-football-stats',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};
