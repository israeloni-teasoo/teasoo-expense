import "server-only";
import { sql } from "drizzle-orm";
import type { Executor } from "@/db";
import { formatRequisitionReference } from "@/lib/requisition-rules";

/** Generates sequential references such as AL-2026-00124 atomically. */
export async function nextReference(exec: Executor, prefix: "AL" | "EXP" | "CLM", year = new Date().getFullYear()) {
  const key = `${prefix}-${year}`;
  const result = await exec.execute<{ value: number }>(sql`
    INSERT INTO counters (key, value) VALUES (${key}, 1)
    ON CONFLICT (key) DO UPDATE SET value = counters.value + 1
    RETURNING value
  `);
  const value = Number(result.rows[0].value);
  return `${key}-${String(value).padStart(5, "0")}`;
}

/** Counter key for requisition numbers; organisations sharing a prefix share the sequence, so numbers never clash. */
export const requisitionCounterKey = (prefix: string) => `PR:${prefix}`;

/** Requisition references in the Zoho style: TC-PR-00100. */
export async function nextRequisitionReference(exec: Executor, prefix: string) {
  const key = requisitionCounterKey(prefix);
  const result = await exec.execute<{ value: number }>(sql`
    INSERT INTO counters (key, value) VALUES (${key}, 1)
    ON CONFLICT (key) DO UPDATE SET value = counters.value + 1
    RETURNING value
  `);
  return formatRequisitionReference(prefix, Number(result.rows[0].value));
}

/** The number the next requisition with this prefix will get. */
export async function peekRequisitionNumber(exec: Executor, prefix: string) {
  const r = await exec.execute<{ value: number }>(sql`SELECT value FROM counters WHERE key = ${requisitionCounterKey(prefix)}`);
  return Number(r.rows[0]?.value ?? 0) + 1;
}
