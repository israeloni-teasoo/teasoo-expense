import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, type Executor } from "@/db";
import { config } from "@/lib/config";
import { DEFAULT_ORG_SETTINGS, departments, expenseCategories, memberships, organisations, projects, users, type OrgSettings } from "@/db/schema";

export async function getOrg(orgId: string, exec: Executor = db) {
  const org = await exec.query.organisations.findFirst({ where: eq(organisations.id, orgId) });
  if (!org) throw new Error("Organisation not found");
  const settings = { ...DEFAULT_ORG_SETTINGS, ...(org.settings ?? {}) } as OrgSettings;
  // The hosting platform's request-size limit wins over the configured upload size.
  settings.maxUploadMb = Math.min(settings.maxUploadMb, config.platformUploadCapMb);
  return { ...org, settings };
}

export async function getSettings(orgId: string, exec: Executor = db): Promise<OrgSettings> {
  return (await getOrg(orgId, exec)).settings;
}

/** Reference data used across forms and filters. `users` are the members of the organisation. */
export async function getLookups(orgId: string) {
  const [cats, depts, projs, people] = await Promise.all([
    db.select().from(expenseCategories).where(eq(expenseCategories.organisationId, orgId)).orderBy(asc(expenseCategories.name)),
    db.select().from(departments).where(eq(departments.organisationId, orgId)).orderBy(asc(departments.name)),
    db.select().from(projects).where(eq(projects.organisationId, orgId)).orderBy(asc(projects.name)),
    db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        role: memberships.role,
        // Suspended in this organisation, or everywhere.
        status: sql<"ACTIVE" | "SUSPENDED">`case when ${memberships.status} = 'ACTIVE' and ${users.status} = 'ACTIVE' then 'ACTIVE' else 'SUSPENDED' end`,
        departmentId: memberships.departmentId,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.organisationId, orgId)))
      .orderBy(asc(users.firstName), asc(users.lastName)),
  ]);
  return {
    categories: cats,
    activeCategories: cats.filter((c) => !c.archived),
    departments: depts,
    activeDepartments: depts.filter((d) => !d.archived),
    projects: projs,
    activeProjects: projs.filter((p) => !p.archived),
    users: people.map((p) => ({ ...p, fullName: `${p.firstName} ${p.lastName}` })),
  };
}
export type Lookups = Awaited<ReturnType<typeof getLookups>>;
