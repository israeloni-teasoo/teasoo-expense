import "server-only";
import { asc, sql } from "drizzle-orm";
import { db } from "@/db";
import { DEFAULT_CATEGORIES, DEFAULT_DEPARTMENTS } from "@/db/defaults";
import { departments, expenseCategories, organisations } from "@/db/schema";
import { config } from "@/lib/config";

/**
 * The app is single-organisation. On a fresh production database the organisation and its
 * default categories and departments are created the first time someone signs in.
 */
export async function ensureOrganisation() {
  const existing = await db.select().from(organisations).orderBy(asc(organisations.createdAt)).limit(1);
  if (existing[0]) return existing[0];
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(724001)`);
    const again = await tx.select().from(organisations).limit(1);
    if (again[0]) return again[0];
    const [org] = await tx.insert(organisations).values({ name: config.organisationName }).returning();
    await tx.insert(departments).values(DEFAULT_DEPARTMENTS.map((name) => ({ organisationId: org.id, name, code: name.slice(0, 3).toUpperCase() })));
    await tx
      .insert(expenseCategories)
      .values(DEFAULT_CATEGORIES.map((c) => ({ organisationId: org.id, name: c.name, keywords: c.keywords, receiptRequired: c.receiptRequired ?? true })));
    return org;
  });
}
