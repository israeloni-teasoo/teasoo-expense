import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { appDatabaseUrl, poolConfig } from "./pool-config";
import * as schema from "./schema";

declare global {
  var __pgPool: Pool | undefined;
}

function createPool() {
  // Serverless functions each hold their own pool, so keep it small and use Supabase's pooler URL.
  return new Pool(poolConfig(appDatabaseUrl(), process.env.VERCEL ? 3 : 10));
}

// Reuse the pool across hot reloads in development.
const pool = globalThis.__pgPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalThis.__pgPool = pool;

export const db = drizzle(pool, { schema });
export type DB = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type Executor = DB | Tx;
export { schema };
