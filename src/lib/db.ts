import mysql from "mysql2/promise";

export async function getConnection() {
  const connection = await mysql.createConnection({
  host: "virendhl.beget.tech",
  user: "virendhl_cyberf",
  password: "Acfdatabase2233!",
  database: "virendhl_cyberf",
  });

  return connection;
}

