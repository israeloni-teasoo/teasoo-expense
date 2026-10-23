import "server-only";
import { sql } from "drizzle-orm";
import type { Executor } from "@/db";

/** Generates sequential references such as AL-2026-00124 atomically. */
export async function nextReference(exec: Executor, prefix: "AL" | "EXP" | "CLM" | "PR", year = new Date().getFullYear()) {
  const key = `${prefix}-${year}`;
  const result = await exec.execute<{ value: number }>(sql`
    INSERT INTO counters (key, value) VALUES (${key}, 1)
    ON CONFLICT (key) DO UPDATE SET value = counters.value + 1
    RETURNING value
  `);
  const value = Number(result.rows[0].value);
  return `${key}-${String(value).padStart(5, "0")}`;
}
