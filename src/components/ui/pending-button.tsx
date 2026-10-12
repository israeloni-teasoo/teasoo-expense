"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/cn";
import { Spinner } from "./spinner";

/**
 * Submit button for plain `<form action={serverAction}>` forms: shows a spinner and blocks
 * repeat clicks while the action runs. Styling is left entirely to the caller.
 */
export function PendingButton({ children, className, ...props }: ComponentProps<"button">) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      {...props}
      disabled={pending || props.disabled}
      aria-busy={pending || undefined}
      className={cn(className, "inline-flex items-center justify-center gap-2", pending && "cursor-wait opacity-80 [&>svg:not(.animate-spin)]:hidden")}
    >
      {pending && <Spinner />}
      {children}
    </button>
  );
}
