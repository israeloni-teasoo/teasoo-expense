import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, FormField, SubmitButton } from "@/components/ui/action-form";
import { Input } from "@/components/ui/form";
import { AuthLayout } from "@/components/shell/auth-layout";
import { forgotPasswordAction } from "@/app/actions/auth";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <AuthLayout title="Reset your password" subtitle="Enter your work email and we'll send you a link to set a new password.">
      <ActionForm action={forgotPasswordAction} resetOnSuccess>
        <FormField name="email" label="Email address">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </FormField>
        <SubmitButton className="w-full" size="lg" pendingText="Sending…">
          Send reset link
        </SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-sm text-gray-500">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-brand-700 hover:text-brand-800">
          Back to sign in
        </Link>
      </p>
      <p className="mt-4 text-center text-xs text-gray-400">Can&apos;t access your email? Ask an administrator to reset your password.</p>
    </AuthLayout>
  );
}
