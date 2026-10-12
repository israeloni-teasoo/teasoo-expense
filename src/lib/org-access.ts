/** Picks the organisation to work in: the remembered one if still allowed, else the home organisation, else the first. */
export function pickActiveOrganisation<T extends { organisationId: string }>(orgs: T[], preferred: string | undefined, home: string): T | null {
  return orgs.find((o) => o.organisationId === preferred) ?? orgs.find((o) => o.organisationId === home) ?? orgs[0] ?? null;
}
