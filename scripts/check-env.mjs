/**
 * Pre-build environment check (runs in `vercel-build`). Fails fast with a readable list of
 * missing settings instead of a stack trace, and warns about optional features that are off.
 */
try {
  await import("dotenv/config");
} catch {
  // dotenv is optional; platform environment variables are used as-is.
}
const env = process.env;
const errors = [];
const warnings = [];
const onVercel = Boolean(env.VERCEL);
const where = onVercel ? ` (Vercel → Project → Settings → Environment Variables, enabled for "${env.VERCEL_ENV ?? "this"}" deployments)` : "";

if (!(env.DATABASE_URL || env.POSTGRES_URL || env.POSTGRES_PRISMA_URL))
  errors.push("DATABASE_URL — Supabase → Connect → Transaction pooler connection string (or connect Supabase via the Vercel integration, which sets POSTGRES_URL)");
if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) errors.push("AUTH_SECRET — a random string of at least 32 characters (e.g. `openssl rand -base64 48`)");

const storage = env.STORAGE_DRIVER || (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY ? "supabase" : "local");
if (onVercel && storage !== "supabase")
  errors.push("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY — receipts can't be stored on Vercel's read-only disk; Supabase Storage is required");
if (storage === "supabase" && !(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY)) errors.push("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (STORAGE_DRIVER=supabase)");

if (!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)) warnings.push("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set — Google sign-in is disabled");
if (!env.BOOTSTRAP_ADMIN_EMAILS) warnings.push("BOOTSTRAP_ADMIN_EMAILS not set — nobody becomes an administrator automatically on a fresh database");
if (!env.RESEND_API_KEY) warnings.push("RESEND_API_KEY not set — emails are logged instead of sent");
if (!env.APP_URL && !env.VERCEL_PROJECT_PRODUCTION_URL) warnings.push("APP_URL not set — links in emails and the Google redirect use http://localhost:3000");

for (const w of warnings) console.warn(`⚠  ${w}`);
if (errors.length) {
  console.error(`\n✗ Missing required configuration${where}:\n${errors.map((e) => `  • ${e}`).join("\n")}\n\nSee .env.example and the README "Deploying to Vercel + Supabase" section.\n`);
  process.exit(1);
}
console.log("✓ Environment looks good");
