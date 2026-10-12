import "server-only";
import { asc, sql } from "drizzle-orm";
import { db, type Executor } from "@/db";
import { DEFAULT_CATEGORIES, DEFAULT_DEPARTMENTS } from "@/db/defaults";
import { departments, expenseCategories, organisations } from "@/db/schema";
import { config } from "@/lib/config";

/** Creates an organisation with the default departments and expense categories (including "Others"). */
export async function createOrganisationRecords(tx: Executor, values: { name: string; currency?: string }) {
  const [org] = await tx.insert(organisations).values({ name: values.name, currency: values.currency ?? "NGN" }).returning();
  await tx.insert(departments).values(DEFAULT_DEPARTMENTS.map((name) => ({ organisationId: org.id, name, code: name.slice(0, 3).toUpperCase() })));
  await tx.insert(expenseCategories).values(
    DEFAULT_CATEGORIES.map((c) => ({
      organisationId: org.id,
      name: c.name,
      keywords: c.keywords || null,
      description: c.description ?? null,
      receiptRequired: c.receiptRequired ?? true,
      isOther: c.isOther ?? false,
    })),
  );
  return org;
}

/**
 * On a fresh production database the first organisation is created the first time a
 * bootstrap administrator (BOOTSTRAP_ADMIN_EMAILS) signs in.
 */
export async function ensureOrganisation() {
  const existing = await db.select().from(organisations).orderBy(asc(organisations.createdAt)).limit(1);
  if (existing[0]) return existing[0];
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(724001)`);
    const again = await tx.select().from(organisations).limit(1);
    if (again[0]) return again[0];
    return createOrganisationRecords(tx, { name: config.organisationName });
  });
}
