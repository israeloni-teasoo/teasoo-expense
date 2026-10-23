import "server-only";
import type { Executor } from "@/db";
import { auditLogs } from "@/db/schema";
import { requestMeta } from "./request-context";

export type AuditEntry = {
  organisationId: string;
  userId: string | null;
  entityType: "ALLOCATION" | "EXPENSE" | "DOCUMENT" | "RETURN" | "CLAIM" | "RECONCILIATION" | "USER" | "CATEGORY" | "DEPARTMENT" | "PROJECT" | "SETTINGS" | "AUTH" | "EXPORT" | "FEEDBACK" | "ORGANISATION" | "REQUISITION" | "VENDOR";
  entityId?: string | null;
  entityRef?: string | null;
  allocationId?: string | null;
  action: string;
  summary: string;
  oldValues?: unknown;
  newValues?: unknown;
};

/** Every important action is written to the audit log inside the same transaction as the change. */
export async function audit(exec: Executor, entry: AuditEntry) {
  const meta = await requestMeta();
  await exec.insert(auditLogs).values({
    organisationId: entry.organisationId,
    userId: entry.userId,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    entityRef: entry.entityRef ?? null,
    allocationId: entry.allocationId ?? null,
    action: entry.action,
    summary: entry.summary,
    oldValues: entry.oldValues ?? null,
    newValues: entry.newValues ?? null,
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });
}

/** Keep only the fields that changed, for compact before/after audit records. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    const a = before[key];
    const b = after[key];
    const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : v ?? null);
    if (JSON.stringify(norm(a)) !== JSON.stringify(norm(b))) {
      oldValues[key] = norm(a);
      newValues[key] = norm(b);
    }
  }
  return { oldValues, newValues, changed: Object.keys(newValues).length > 0 };
}
