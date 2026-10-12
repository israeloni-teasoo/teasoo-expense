import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, FormField, SubmitButton } from "@/components/ui/action-form";
import { Input } from "@/components/ui/form";
import { AuthLayout } from "@/components/shell/auth-layout";
import { loginAction } from "@/app/actions/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const demo = process.env.NODE_ENV !== "production" || process.env.SHOW_DEMO_ACCOUNTS === "1";
  return (
    <AuthLayout title="Sign in to your workspace" subtitle="Track funds, log expenses and reconcile — all in one place.">
      <ActionForm action={loginAction}>
        <input type="hidden" name="next" value={next ?? ""} />
        <FormField name="email" label="Email address">
          <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@company.com" />
        </FormField>
        <FormField name="password" label="Password">
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </FormField>
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-sm font-medium text-brand-700 hover:text-brand-800">
            Forgot password?
          </Link>
        </div>
        <SubmitButton className="w-full" size="lg" pendingText="Signing in…">
          Sign in
        </SubmitButton>
      </ActionForm>
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
