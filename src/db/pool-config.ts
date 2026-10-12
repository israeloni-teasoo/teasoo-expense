const MISSING = `No database connection string found.
Set DATABASE_URL (Supabase "Transaction pooler" string) — or connect Supabase through the Vercel
integration, which provides POSTGRES_URL / POSTGRES_URL_NON_POOLING. In Vercel, make sure the
variables are enabled for the environment being built (Production AND Preview).`;

/** Pooled connection for the running app. Falls back to the Vercel Supabase integration's names. */
export function appDatabaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || undefined;
}

/** Session-mode connection for migrations and scripts (pgbouncer transaction mode can't run DDL safely). */
export function directDatabaseUrl() {
  return process.env.DIRECT_URL || process.env.POSTGRES_URL_NON_POOLING || appDatabaseUrl();
}

export function poolConfig(connectionString: string | undefined, max: number) {
  if (!connectionString) throw new Error(MISSING);
  const url = new URL(connectionString);
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  // Hosted Postgres (Supabase) requires TLS. node-postgres treats sslmode in the URL strictly,
  // so it is stripped and TLS is configured here instead. Supabase's extra "supa" hint is dropped too.
  url.searchParams.delete("sslmode");
  url.searchParams.delete("supa");
  return {
    connectionString: url.toString(),
    max,
    ssl: local ? undefined : { rejectUnauthorized: false },
    idleTimeoutMillis: 10_000,
  };
}
