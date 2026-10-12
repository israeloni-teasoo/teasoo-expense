import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, FormField, SubmitButton } from "@/components/ui/action-form";
import { Input } from "@/components/ui/form";
import { AuthLayout } from "@/components/shell/auth-layout";
import { resetPasswordAction } from "@/app/actions/auth";

export const metadata: Metadata = { title: "Set a new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthLayout title="Choose a new password" subtitle="At least 8 characters, with letters and numbers.">
      {token ? (
        <ActionForm action={resetPasswordAction}>
          <input type="hidden" name="token" value={token} />
          <FormField name="password" label="New password">
            <Input id="password" name="password" type="password" autoComplete="new-password" required />
          </FormField>
          <FormField name="confirm" label="Confirm new password">
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
          </FormField>
          <SubmitButton className="w-full" size="lg" pendingText="Saving…">
            Update password
          </SubmitButton>
        </ActionForm>
      ) : (
        <p className="text-sm text-gray-600">
          This link is missing its token.{" "}
          <Link className="font-medium text-brand-700" href="/forgot-password">
            Request a new link
          </Link>
          .
        </p>
      )}
    </AuthLayout>
  );
}
