"use client";

import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { testEmailAction, testStorageAction } from "@/app/actions/admin";

export function DiagnosticsButtons() {
  return (
    <div className="flex flex-wrap gap-2">
      <ActionForm action={testStorageAction} className="space-y-2">
        <SubmitButton size="sm" variant="secondary" pendingText="Testing storage…">
          Test storage
        </SubmitButton>
      </ActionForm>
      <ActionForm action={testEmailAction} className="space-y-2">
        <SubmitButton size="sm" variant="secondary" pendingText="Sending…">
          Send test email
        </SubmitButton>
      </ActionForm>
    </div>
  );
}
