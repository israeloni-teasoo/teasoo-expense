import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, FormField, SubmitButton } from "@/components/ui/action-form";
import { Input } from "@/components/ui/form";
import { AuthLayout } from "@/components/shell/auth-layout";
import { GoogleButton } from "@/components/shell/google-button";
import { config, googleEnabled } from "@/lib/config";
import { loginAction } from "@/app/actions/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const google = googleEnabled();
  const demo = process.env.NODE_ENV !== "production" || process.env.SHOW_DEMO_ACCOUNTS === "1";
  const passwordForm = (
    <ActionForm action={loginAction}>
      <input type="hidden" name="next" value={next ?? ""} />
      <FormField name="email" label="Email address">
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
      </FormField>
      <FormField name="password" label="Password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </FormField>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm font-medium text-brand-700 hover:text-brand-800">
          Forgot password?
        </Link>
      </div>
      <SubmitButton className="w-full" size="lg" variant={google ? "secondary" : "primary"} pendingText="Signing in…">
        Sign in
      </SubmitButton>
    </ActionForm>
  );

  return (
    <AuthLayout title="Sign in to your workspace" subtitle="Track funds, log expenses and reconcile — all in one place.">
      {error && (
        <div role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error === "google_not_configured" ? "Google sign-in isn't set up yet." : error}
        </div>
      )}
      {google ? (
        <>
          <GoogleButton next={next} domain={config.companyDomain} />
          <p className="mt-2 text-center text-xs text-gray-500">For staff with an @{config.companyDomain} email</p>
          <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wide text-gray-400">
            <span className="h-px flex-1 bg-gray-200" /> Ad-hoc staff <span className="h-px flex-1 bg-gray-200" />
          </div>
          <p className="mb-4 text-sm text-gray-600">No company email? Sign in with the login details finance sent you.</p>
          {passwordForm}
        </>
      ) : (
        passwordForm
      )}
      <p className="mt-6 text-center text-xs text-gray-500">Access is by invitation. If you can&apos;t sign in, ask your administrator or accountant to invite you.</p>
      {demo && (
        <div className="mt-8 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-xs text-gray-600">
          <p className="mb-2 font-semibold text-gray-700">Demo accounts (password: Password123)</p>
          <ul className="grid gap-1 sm:grid-cols-2">
            <li><span className="font-medium">Staff:</span> staff@teasoo.test</li>
            <li><span className="font-medium">Accountant:</span> accountant@teasoo.test</li>
            <li><span className="font-medium">Admin:</span> admin@teasoo.test</li>
            <li><span className="font-medium">Management:</span> management@teasoo.test</li>
          </ul>
        </div>
      )}
    </AuthLayout>
  );
}
