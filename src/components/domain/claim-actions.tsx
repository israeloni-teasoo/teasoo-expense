"use client";

import { ActionForm, FormField, SubmitButton } from "@/components/ui/action-form";
import { Textarea } from "@/components/ui/form";
import { ModalButton } from "@/components/ui/modal";
import { decideClaimAction } from "@/app/actions/claims";

export function ClaimDecision({
  claimId,
  decision,
  label,
  variant = "secondary",
  requireComment,
  description,
}: {
  claimId: string;
  decision: "RECOMMEND" | "APPROVE" | "REJECT" | "CANCEL";
  label: string;
  variant?: "primary" | "secondary" | "danger" | "success" | "ghost";
  requireComment?: boolean;
  description?: string;
}) {
  return (
    <ModalButton label={label} size="sm" variant={variant} title={label} description={description} modalSize="sm">
      <ActionForm action={decideClaimAction}>
        <input type="hidden" name="claimId" value={claimId} />
        <input type="hidden" name="decision" value={decision} />
        {decision !== "CANCEL" && (
          <FormField name="comment" label={requireComment ? "Reason" : "Comment (optional)"} required={requireComment}>
            <Textarea id="comment" name="comment" rows={3} />
          </FormField>
        )}
        <div className="flex justify-end">
          <SubmitButton variant={variant === "ghost" ? "secondary" : variant} pendingText="Saving…">
            {label}
          </SubmitButton>
        </div>
      </ActionForm>
    </ModalButton>
  );
}
