import postgres from "postgres";

let _sql: ReturnType<typeof postgres> | undefined;

export function getDb(): ReturnType<typeof postgres> {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    // Replit PostgreSQL uses internal hostname "helium" — no SSL needed for in-cluster connections
    _sql = postgres(url, {
      connect_timeout: 10,
      idle_timeout: 20,
      max: 10,
    });
  }
  return _sql;
}
