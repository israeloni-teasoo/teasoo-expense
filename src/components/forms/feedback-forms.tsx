"use client";

import { useEffect, useRef, useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { ActionForm, FormField, SubmitButton } from "@/components/ui/action-form";
import { Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { respondFeedbackAction, sendFeedbackAction } from "@/app/actions/feedback";

const CATEGORIES = [
  ["BUG", "Something isn't working"],
  ["IDEA", "Idea or suggestion"],
  ["QUESTION", "Question"],
  ["OTHER", "Other"],
] as const;

export function FeedbackForm({ defaultPage }: { defaultPage?: string }) {
  const page = useRef<HTMLInputElement>(null);
  const ua = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (page.current && !page.current.value) page.current.value = defaultPage ?? window.location.pathname + window.location.search;
    if (ua.current) ua.current.value = navigator.userAgent;
  }, [defaultPage]);
  return (
    <ActionForm action={sendFeedbackAction} resetOnSuccess>
      <input ref={page} type="hidden" name="pageUrl" defaultValue={defaultPage} />
      <input ref={ua} type="hidden" name="userAgent" />
      <FormField name="category" label="What kind of feedback?">
        <Select id="category" name="category" defaultValue="BUG">
          {CATEGORIES.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </Select>
      </FormField>
      <FormField name="subject" label="Subject" hint="Optional — a short summary">
        <Input id="subject" name="subject" maxLength={120} />
      </FormField>
      <FormField name="message" label="Details" required>
        <Textarea id="message" name="message" rows={5} placeholder="What happened, what you expected, or what would help…" />
      </FormField>
      <FormField name="screenshots" label="Screenshot" hint="Optional — JPG, PNG, WebP or PDF">
        <Input id="screenshots" name="screenshots" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,image/*,application/pdf" className="h-auto py-2" />
      </FormField>
      <div className="flex justify-end">
        <SubmitButton pendingText="Sending…">Send feedback</SubmitButton>
      </div>
    </ActionForm>
  );
}

/** Top-bar button: opens the feedback form and remembers which page the person was on. */
export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<string>();
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setPage(window.location.pathname + window.location.search);
          setOpen(true);
        }}
        className="rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        aria-label="Send feedback"
        title="Send feedback"
      >
        <MessageSquarePlus className="h-5 w-5" />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Send feedback" description="Report a problem or suggest an improvement. Administrators will reply here.">
        <FeedbackForm defaultPage={page} />
      </Modal>
    </>
  );
}

export function RespondFeedbackForm({ id, status, response }: { id: string; status: string; response: string | null }) {
  return (
    <ActionForm action={respondFeedbackAction}>
      <input type="hidden" name="feedbackId" value={id} />
      <FormField name="status" label="Status">
        <Select id="status" name="status" defaultValue={status === "OPEN" ? "IN_PROGRESS" : status}>
          <option value="OPEN">New</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed (won&apos;t do)</option>
        </Select>
      </FormField>
      <FormField name="response" label="Reply to the sender" hint="Optional. They're notified of the reply and any status change.">
        <Textarea id="response" name="response" rows={4} defaultValue={response ?? ""} />
      </FormField>
      <div className="flex justify-end">
        <SubmitButton pendingText="Saving…">Save</SubmitButton>
      </div>
    </ActionForm>
  );
}
