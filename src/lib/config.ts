/** Environment-driven configuration. Everything optional degrades gracefully in development. */
const DEFAULT_EMAIL_FROM = "Teasoo Expense <notifications@expense.teasooconsulting.com>";

export const config = {
  // On Vercel, default to the project's production domain so Google redirects and email links work.
  appUrl: (
    process.env.APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")
  ).replace(/\/$/, ""),
  /** Company Google Workspace domain. People with this email domain sign in with Google. */
  companyDomain: (process.env.COMPANY_EMAIL_DOMAIN ?? "teasooconsulting.com").toLowerCase(),
  /** Comma-separated emails that become administrators on their first Google sign-in. */
  bootstrapAdmins: (process.env.BOOTSTRAP_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  organisationName: process.env.ORGANISATION_NAME ?? "Teasoo Consulting",
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  },
  email: {
    resendApiKey: process.env.RESEND_API_KEY ?? "",
    // Must be an address on the domain verified in Resend (expense.teasooconsulting.com).
    // An invalid EMAIL_FROM falls back to this default (see emailFromWarning).
    from: process.env.EMAIL_FROM && !emailFromProblem(process.env.EMAIL_FROM) ? process.env.EMAIL_FROM : DEFAULT_EMAIL_FROM,
  },
  /** Vercel rejects request bodies over 4.5 MB, so uploads are capped below that there. */
  platformUploadCapMb: process.env.VERCEL ? 4 : 25,
};

export const googleEnabled = () => Boolean(config.google.clientId && config.google.clientSecret);
export const emailEnabled = () => Boolean(config.email.resendApiKey);

export function isCompanyEmail(email: string) {
  return email.trim().toLowerCase().endsWith("@" + config.companyDomain);
}

/**
 * Resend accepts "name@domain" or "Display Name <name@domain>". Returns a readable problem,
 * or null when EMAIL_FROM is usable.
 */
export function emailFromProblem(from: string): string | null {
  const m = /^\s*(?:[^<>]*<\s*([^<>\s]+)\s*>|([^<>\s]+))\s*$/.exec(from);
  const address = m?.[1] ?? m?.[2];
  if (!address || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    return `EMAIL_FROM "${from}" isn't a valid sender. Use e.g. Teasoo Expense <notifications@expense.teasooconsulting.com>.`;
  }
  return null;
}

/** Shown to admins when EMAIL_FROM is set but unusable (the default sender is used instead). */
export function emailFromWarning(): string | null {
  const raw = process.env.EMAIL_FROM;
  if (!raw) return null;
  const problem = emailFromProblem(raw);
  return problem ? `${problem} Using ${DEFAULT_EMAIL_FROM} instead.` : null;
}
