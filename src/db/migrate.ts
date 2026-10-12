import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { directDatabaseUrl, poolConfig } from "./pool-config";

async function main() {
  // Migrations need a session-mode connection; prefer DIRECT_URL (Supabase session pooler / direct) when set.
  const pool = new Pool(poolConfig(directDatabaseUrl(), 1));
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
  console.log("Migrations applied");
}

main().catch((err) => {
  console.error(err instanceof Error && err.message.startsWith("No database") ? `\n${err.message}\n` : err);
  process.exit(1);
});
