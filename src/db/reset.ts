import "dotenv/config";
import { Pool } from "pg";
import { poolConfig } from "./pool-config";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to reset a production database");
  const pool = new Pool(poolConfig(process.env.DIRECT_URL || process.env.DATABASE_URL, 1));
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
  await pool.end();
  console.log("Database reset");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
