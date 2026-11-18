const MISSING = `No database connection string found.
Set DATABASE_URL (Neon → Connect → "Pooled connection" string) — or connect Neon through the Vercel
integration, which provides DATABASE_URL / DATABASE_URL_UNPOOLED. In Vercel, make sure the
variables are enabled for the environment being built (Production AND Preview).`;

/**
 * Pooled connection for the running app. DATABASE_URL is what Neon (and its Vercel integration) sets;
 * POSTGRES_URL / POSTGRES_PRISMA_URL are the older Vercel Postgres / Supabase integration names.
 */
export function appDatabaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || undefined;
}

/**
 * Direct (unpooled) connection for migrations and scripts: PgBouncer in transaction mode can't run DDL
 * safely. Neon's Vercel integration calls it DATABASE_URL_UNPOOLED; DIRECT_URL can be set by hand.
 */
export function directDatabaseUrl() {
  return (
    process.env.DIRECT_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING ||
    appDatabaseUrl()
  );
}

export function poolConfig(connectionString: string | undefined, max: number) {
  if (!connectionString) throw new Error(MISSING);
  const url = new URL(connectionString);
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  // Hosted Postgres (Neon) requires TLS. node-postgres treats sslmode in the URL strictly, so it is
  // stripped and TLS is configured here instead. Neon's channel_binding=require becomes pg's own option,
  // and Supabase's old "supa" hint is dropped.
  const channelBinding = url.searchParams.get("channel_binding") === "require";
  for (const p of ["sslmode", "channel_binding", "supa"]) url.searchParams.delete(p);
  return {
    connectionString: url.toString(),
    max,
    ssl: local ? undefined : { rejectUnauthorized: false },
    enableChannelBinding: channelBinding,
    idleTimeoutMillis: 10_000,
  };
}
