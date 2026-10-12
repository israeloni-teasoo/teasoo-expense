/** Environment-driven configuration. Everything optional degrades gracefully in development. */
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
    from: process.env.EMAIL_FROM ?? "Teasoo Expense <notifications@teasooconsulting.com>",
  },
  /** Vercel rejects request bodies over 4.5 MB, so uploads are capped below that there. */
  platformUploadCapMb: process.env.VERCEL ? 4 : 25,
};

export const googleEnabled = () => Boolean(config.google.clientId && config.google.clientSecret);
export const emailEnabled = () => Boolean(config.email.resendApiKey);

export function isCompanyEmail(email: string) {
  return email.trim().toLowerCase().endsWith("@" + config.companyDomain);
}
