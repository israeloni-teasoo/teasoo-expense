"use client";

import { createContext, useContext, useRef, useState, useTransition, type ComponentProps, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import type { ActionResult } from "@/lib/errors";
import { cn } from "@/lib/cn";
import { compressFormData } from "@/lib/compress-image";
import { startNavigationProgress } from "@/components/shell/navigation-progress";
import { Button } from "./button";
import { Field } from "./form";
import { useModal } from "./modal";
import { useToast } from "./toast";

export type FormAction = (prev: ActionResult<unknown> | null, formData: FormData) => Promise<ActionResult<unknown>>;

type FormStateValue = {
  state: ActionResult<unknown> | null;
  pending: boolean;
  /** "name=value" of the submit button that started the pending submission ("" for unnamed buttons). */
  activeSubmitter: string | null;
};
const FormStateContext = createContext<FormStateValue>({ state: null, pending: false, activeSubmitter: null });
const submitterKey = (el: Element | null) => (el ? `${el.getAttribute("name") ?? ""}=${el.getAttribute("value") ?? ""}` : null);
export const useFormState = () => useContext(FormStateContext);

export function useFieldError(name: string) {
  const { state } = useFormState();
  return state && !state.ok ? state.fieldErrors?.[name] : undefined;
}

/**
 * Wraps a server action with: pending state, inline field errors, an error banner,
 * success toasts, redirects, closing the surrounding modal, and "are you sure?"
 * confirmations (e.g. possible duplicate expense) that resubmit with a confirm flag.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  onSuccess,
  closeOnSuccess = true,
  ...rest
}: Omit<ComponentProps<"form">, "action" | "onSubmit"> & {
  action: FormAction;
  children: ReactNode;
  resetOnSuccess?: boolean;
  onSuccess?: (result: ActionResult<unknown>) => void;
  /** Close the surrounding modal after success (default). */
  closeOnSuccess?: boolean;
}) {
  const [state, setState] = useState<ActionResult<unknown> | null>(null);
  const [pending, startTransition] = useTransition();
  const [activeSubmitter, setActiveSubmitter] = useState<string | null>(null);
  // After a successful save that redirects, keep the button spinning until the next page shows.
  const [redirecting, setRedirecting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const submitter = useRef<HTMLElement | null>(null);
  const acknowledged = useRef(new Set<string>());
  const [dismissed, setDismissed] = useState<ActionResult<unknown> | null>(null);
  const router = useRouter();
  const toast = useToast();
  const modal = useModal();

  // Results are handled in the submit callback (not an effect) so success still toasts/redirects
  // when the server refresh unmounts this form (e.g. the review panel disappears after approval).
  function handle(result: ActionResult<unknown>) {
    setState(result);
    if (!result.ok) return;
    acknowledged.current.clear();
    if (result.message) toast(result.message);
    if (resetOnSuccess) formRef.current?.reset();
    onSuccess?.(result);
    if (result.redirectTo) {
      setRedirecting(true);
      startNavigationProgress();
      router.push(result.redirectTo);
      setTimeout(() => setRedirecting(false), 15000); // safety net if the page never changes
    }
    else if (closeOnSuccess) modal?.close();
  }

  function submit(extra?: string) {
    const form = formRef.current;
    if (!form || pending || redirecting) return;
    setActiveSubmitter(extra ? `confirm=${extra}` : submitterKey(submitter.current));
    const raw = submitter.current ? new FormData(form, submitter.current) : new FormData(form);
    if (extra) acknowledged.current.add(extra);
    for (const k of acknowledged.current) raw.set(`confirm_${k}`, "1");
    startTransition(async () => {
      try {
        const fd = await compressFormData(raw);
        handle(await action(state, fd));
      } catch (e) {
        console.error(e);
        handle({ ok: false, error: "Something went wrong. Check your connection and try again." });
      }
    });
  }

  const warning = state && !state.ok && dismissed !== state ? state.warning : undefined;
  const error = state && !state.ok && !warning ? state.error : undefined;

  return (
    <FormStateContext.Provider value={{ state, pending: pending || redirecting, activeSubmitter }}>
      <form
        ref={formRef}
        className={cn("space-y-4", className)}
        onSubmit={(e) => {
          e.preventDefault();
          submitter.current = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
          submit();
        }}
        noValidate
        method="post"
        data-action-form=""
        {...rest}
      >
        {error && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}
        {children}
        {warning && (
          <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div className="flex-1">
                <p className="font-semibold">{warning.kind === "DUPLICATE" ? "Possible duplicate" : "Over budget"}</p>
                <p className="mt-1">{warning.message}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="primary" loading={pending} onClick={() => submit(warning.kind)}>
                    Yes, continue
                  </Button>
                  <Button type="button" size="sm" variant="secondary" onClick={() => {
                      setDismissed(state);
                      formRef.current?.querySelector<HTMLElement>("input:not([type=hidden]),select,textarea")?.focus();
                    }}>
                    Go back and edit
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </form>
    </FormStateContext.Provider>
  );

}

export function FormField({
  name,
  label,
  hint,
  required,
  children,
  className,
}: {
  name: string;
  label: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const error = useFieldError(name);
  return (
    <Field label={label} htmlFor={name} error={error} hint={hint} required={required} className={className}>
      {children}
    </Field>
  );
}

export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  size = "md",
  className,
  name,
  value,
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: "primary" | "secondary" | "danger" | "success" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending, activeSubmitter } = useFormState();
  // Only the button that was clicked shows the spinner; the others are just blocked.
  const mine = pending && (activeSubmitter === null || activeSubmitter === `${name ?? ""}=${value ?? ""}`);
  return (
    <Button type="submit" variant={variant} size={size} disabled={pending} loading={mine} className={className} name={name} value={value}>
      {mine && pendingText ? pendingText : children}
    </Button>
  );
}
