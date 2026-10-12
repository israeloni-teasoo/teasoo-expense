import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

const control =
  "block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-brand-600 disabled:bg-gray-50 disabled:text-gray-500";

export function Input({ className, invalid, ...props }: ComponentProps<"input"> & { invalid?: boolean }) {
  return <input className={cn(control, "h-10", invalid && "ring-red-400", className)} aria-invalid={invalid || undefined} {...props} />;
}

export function Textarea({ className, invalid, ...props }: ComponentProps<"textarea"> & { invalid?: boolean }) {
  return <textarea className={cn(control, invalid && "ring-red-400", className)} aria-invalid={invalid || undefined} rows={3} {...props} />;
}

export function Select({ className, invalid, ...props }: ComponentProps<"select"> & { invalid?: boolean }) {
  return <select className={cn(control, "h-10 pr-8", invalid && "ring-red-400", className)} aria-invalid={invalid || undefined} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("mb-1 block text-sm font-medium text-gray-700", className)} {...props} />;
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
  required,
}: {
  label: ReactNode;
  htmlFor?: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  required?: boolean;
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="text-red-500"> *</span>}
      </Label>
      {children}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : hint ? <p className="mt-1 text-xs text-gray-500">{hint}</p> : null}
    </div>
  );
}

export function Checkbox({ label, description, ...props }: ComponentProps<"input"> & { label: ReactNode; description?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-700 focus:ring-brand-600" {...props} />
      <span>
        <span className="block text-sm font-medium text-gray-800">{label}</span>
        {description && <span className="block text-xs text-gray-500">{description}</span>}
      </span>
    </label>
  );
}

export function MoneyInput(props: ComponentProps<"input"> & { invalid?: boolean }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-gray-500">₦</span>
      <Input inputMode="decimal" autoComplete="off" placeholder="0.00" {...props} className={cn("pl-7 tabular-nums", props.className)} />
    </div>
  );
}
