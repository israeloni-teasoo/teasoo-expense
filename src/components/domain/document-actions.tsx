"use client";

import { Trash2, Upload } from "lucide-react";
import { ActionForm, FormField, SubmitButton } from "@/components/ui/action-form";
import { ModalButton } from "@/components/ui/modal";
import { Input, Select } from "@/components/ui/form";
import { removeDocumentAction, uploadExpenseDocsAction } from "@/app/actions/expenses";

export function RemoveDocumentButton({ id, name }: { id: string; name: string }) {
  return (
    <ModalButton label="Remove" icon={<Trash2 className="h-3.5 w-3.5" />} size="sm" variant="ghost" title="Remove document?" modalSize="sm" className="h-auto px-2 py-1 text-red-600">
      <ActionForm action={removeDocumentAction}>
        <input type="hidden" name="documentId" value={id} />
        <p className="text-sm text-gray-600">
          <span className="font-medium text-gray-900">{name}</span> will be removed from this expense. A copy is kept in the audit trail.
        </p>
        <div className="flex justify-end">
          <SubmitButton variant="danger" pendingText="Removing…">
            Remove document
          </SubmitButton>
        </div>
      </ActionForm>
    </ModalButton>
  );
}

export function UploadDocumentsButton({ expenseId, maxUploadMb, label = "Add document" }: { expenseId: string; maxUploadMb: number; label?: string }) {
  return (
    <ModalButton label={label} icon={<Upload className="h-4 w-4" />} size="sm" title="Upload evidence" description={`JPG, PNG, WebP or PDF up to ${maxUploadMb} MB each.`}>
      <ActionForm action={uploadExpenseDocsAction}>
        <input type="hidden" name="expenseId" value={expenseId} />
        <FormField name="kind" label="Type">
          <Select name="kind" id="kind" defaultValue="RECEIPT">
            <option value="RECEIPT">Receipt</option>
            <option value="SUPPORTING">Supporting document</option>
          </Select>
        </FormField>
        <FormField name="files" label="Files">
          <Input type="file" name="files" id="files" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,image/*,application/pdf" className="h-auto py-2" />
        </FormField>
        <div className="flex justify-end">
          <SubmitButton pendingText="Uploading…">Upload</SubmitButton>
        </div>
      </ActionForm>
    </ModalButton>
  );
}
