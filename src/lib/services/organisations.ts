import "server-only";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { memberships, organisations } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/current";
import { audit } from "@/lib/audit";
import { DomainError, forbidden, notFound } from "@/lib/errors";
import { can } from "@/lib/rbac";
import { sniffType, storeUpload } from "@/lib/storage";
import { createOrganisationRecords } from "./bootstrap";

const LOGO_MAX_MB = 2;
const CURRENCIES = ["NGN", "USD", "GBP", "EUR", "GHS", "KES", "ZAR"];

function requireGroupAdmin(actor: CurrentUser) {
  if (!actor.isGroupAdmin) throw forbidden("Only group administrators can manage organisations.");
}

/** Group admins manage every organisation; an organisation's own administrators can edit its name and logo. */
function canEditOrganisation(actor: CurrentUser, orgId: string) {
  if (actor.isGroupAdmin) return true;
  const access = actor.organisations.find((o) => o.organisationId === orgId);
  return !!access && can(access.role, "admin.config");
}

/** Every organisation with its member count (group admins only). */
export async function listOrganisations(actor: CurrentUser) {
  requireGroupAdmin(actor);
  const members = sql<number>`(select count(*)::int from ${memberships} m where m.organisation_id = ${organisations.id} and m.status = 'ACTIVE')`;
  return db
    .select({
      id: organisations.id,
      name: organisations.name,
      currency: organisations.currency,
      archived: organisations.archived,
      logoKey: organisations.logoKey,
      updatedAt: organisations.updatedAt,
      createdAt: organisations.createdAt,
      members,
    })
    .from(organisations)
    .orderBy(asc(organisations.archived), asc(organisations.createdAt));
}

async function storeLogo(file: File) {
  if (file.size > LOGO_MAX_MB * 1024 * 1024) throw new DomainError(`The logo must be ${LOGO_MAX_MB} MB or smaller.`, "VALIDATION", { logo: "Too large." });
  const type = sniffType(Buffer.from(await file.slice(0, 16).arrayBuffer()));
  if (!type || !type.startsWith("image/")) throw new DomainError("Upload the logo as a PNG, JPG or WebP image.", "VALIDATION", { logo: "Not an image." });
  return storeUpload(file, LOGO_MAX_MB);
}

function validate(input: { name: string; currency?: string }) {
  const e: Record<string, string> = {};
  if (!input.name?.trim()) e.name = "Required.";
  else if (input.name.trim().length > 120) e.name = "Keep it under 120 characters.";
  if (input.currency && !CURRENCIES.includes(input.currency)) e.currency = "Choose a currency.";
  if (Object.keys(e).length) throw new DomainError("Please correct the highlighted fields.", "VALIDATION", e);
}

async function assertUniqueName(name: string, exceptId?: string) {
  const clash = await db.query.organisations.findFirst({
    where: and(sql`lower(${organisations.name}) = ${name.trim().toLowerCase()}`, exceptId ? ne(organisations.id, exceptId) : undefined),
  });
  if (clash) throw new DomainError("An organisation with that name already exists.", "VALIDATION", { name: "Already exists." });
}

/**
 * Adds a subsidiary/organisation. It starts with the default departments and categories, and the
 * creator becomes its administrator so they can invite people straight away.
 */
export async function createOrganisation(actor: CurrentUser, input: { name: string; currency?: string; logo?: File | null }) {
  requireGroupAdmin(actor);
  validate(input);
  await assertUniqueName(input.name);
  const logo = input.logo && input.logo.size > 0 ? await storeLogo(input.logo) : null;
  return db.transaction(async (tx) => {
    const org = await createOrganisationRecords(tx, { name: input.name.trim(), currency: input.currency || "NGN" });
    if (logo) await tx.update(organisations).set({ logoKey: logo.storageKey, logoType: logo.fileType }).where(eq(organisations.id, org.id));
    await tx.insert(memberships).values({ userId: actor.id, organisationId: org.id, role: "ADMIN", invitedBy: actor.id });
    await audit(tx, {
      organisationId: org.id,
      userId: actor.id,
      entityType: "ORGANISATION",
      entityId: org.id,
      entityRef: org.name,
      action: "CREATED",
      summary: `${actor.fullName} created the organisation ${org.name}`,
    });
    return org;
  });
}

export async function updateOrganisation(
  actor: CurrentUser,
  id: string,
  input: { name?: string; currency?: string; logo?: File | null; removeLogo?: boolean; archived?: boolean },
) {
  if (!canEditOrganisation(actor, id)) throw forbidden();
  const current = await db.query.organisations.findFirst({ where: eq(organisations.id, id) });
  if (!current) throw notFound("Organisation not found.");
  if (input.archived !== undefined && input.archived !== current.archived) {
    requireGroupAdmin(actor);
    if (input.archived) {
      const live = await db.select({ count: sql<number>`count(*)::int` }).from(organisations).where(and(eq(organisations.archived, false), ne(organisations.id, id)));
      if (Number(live[0].count) === 0) throw new DomainError("You can't archive the only active organisation.");
    }
  }
  const name = input.name?.trim() ?? current.name;
  validate({ name, currency: input.currency });
  if (name.toLowerCase() !== current.name.toLowerCase()) await assertUniqueName(name, id);
  const logo = input.logo && input.logo.size > 0 ? await storeLogo(input.logo) : null;
  const next: Partial<typeof organisations.$inferInsert> = { name, updatedAt: new Date() };
  if (input.currency && actor.isGroupAdmin) next.currency = input.currency;
  if (input.archived !== undefined && actor.isGroupAdmin) next.archived = input.archived;
  if (logo) Object.assign(next, { logoKey: logo.storageKey, logoType: logo.fileType });
  else if (input.removeLogo) Object.assign(next, { logoKey: null, logoType: null });
  await db.transaction(async (tx) => {
    await tx.update(organisations).set(next).where(eq(organisations.id, id));
    const changes = [
      name !== current.name ? `renamed to ${name}` : null,
      logo ? "updated the logo" : input.removeLogo && current.logoKey ? "removed the logo" : null,
      next.archived === true && !current.archived ? "archived it" : null,
      next.archived === false && current.archived ? "restored it" : null,
      next.currency && next.currency !== current.currency ? `set currency to ${next.currency}` : null,
    ].filter(Boolean);
    if (changes.length) {
      await audit(tx, {
        organisationId: id,
        userId: actor.id,
        entityType: "ORGANISATION",
        entityId: id,
        entityRef: name,
        action: next.archived === true && !current.archived ? "ARCHIVED" : "UPDATED",
        summary: `${actor.fullName} updated ${current.name}: ${changes.join(", ")}`,
        oldValues: { name: current.name, archived: current.archived, currency: current.currency },
        newValues: { name, archived: next.archived ?? current.archived, currency: next.currency ?? current.currency },
      });
    }
  });
}
