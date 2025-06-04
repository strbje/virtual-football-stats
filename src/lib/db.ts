import mysql from "mysql2/promise";

export async function getConnection() {
  const connection = await mysql.createConnection({
  host: "strofeheikonk.beget.app",
  user: "cyberfootball",
  password: "Acfdatabase2233!",
  database: "cyberfootball",
  });

  return connection;
}

