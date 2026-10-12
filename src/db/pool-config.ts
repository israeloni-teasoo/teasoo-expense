export function poolConfig(connectionString: string | undefined, max: number) {
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const url = new URL(connectionString);
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  // Hosted Postgres (Supabase) requires TLS. node-postgres treats sslmode in the URL strictly,
  // so it is stripped and TLS is configured here instead.
  url.searchParams.delete("sslmode");
  return {
    connectionString: url.toString(),
    max,
    ssl: local ? undefined : { rejectUnauthorized: false },
    idleTimeoutMillis: 10_000,
  };
}
