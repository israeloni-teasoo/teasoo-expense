import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-5 sm:mb-6">
      {back && (
        <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
          <ChevronLeft className="h-4 w-4" /> {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">{title}</h1>
          {description && <div className="mt-1 text-sm text-gray-500">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  icon,
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "brand" | "amber" | "red" | "green";
  icon?: ReactNode;
  href?: string;
}) {
  const tones = {
    default: "bg-white",
    brand: "bg-brand-800 text-white border-brand-800",
    amber: "bg-amber-50 border-amber-200",
    red: "bg-red-50 border-red-200",
    green: "bg-emerald-50 border-emerald-200",
  };
  const inner = (
    <div className={cn("h-full rounded-xl border border-gray-200 p-4 shadow-sm", tones[tone], href && "transition hover:shadow-md")}>
      <div className="flex items-center justify-between gap-2">
        <p className={cn("text-xs font-medium uppercase tracking-wide", tone === "brand" ? "text-brand-100" : "text-gray-500")}>{label}</p>
        {icon && <span className={tone === "brand" ? "text-brand-200" : "text-gray-400"}>{icon}</span>}
      </div>
      <p className="mt-2 truncate text-xl font-semibold tabular-nums sm:text-2xl">{value}</p>
      {hint && <p className={cn("mt-1 text-xs", tone === "brand" ? "text-brand-100" : "text-gray-500")}>{hint}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function Progress({ value, className, tone }: { value: number; className?: string; tone?: "brand" | "amber" | "red" }) {
  const v = Math.max(0, Math.min(100, value));
  const t = tone ?? (value > 100 ? "red" : value >= 85 ? "amber" : "brand");
  const colors = { brand: "bg-brand-600", amber: "bg-amber-500", red: "bg-red-500" };
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-gray-100", className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-all", colors[t])} style={{ width: `${v}%` }} />
    </div>
  );
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 rounded-full bg-gray-100 p-3 text-gray-400">{icon ?? <Inbox className="h-6 w-6" />}</div>
      <p className="text-sm font-medium text-gray-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-gray-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Money({ value, className, colored, sign }: { value: number; className?: string; colored?: boolean; sign?: boolean }) {
  return (
    <span className={cn("tabular-nums", colored && value < 0 && "text-red-600", className)}>{formatMoney(value, { sign })}</span>
  );
}

export function Pagination({ page, pages, makeHref }: { page: number; pages: number; makeHref: (page: number) => string }) {
  if (pages <= 1) return null;
  return (
    <nav className="flex items-center justify-between gap-2 border-t border-gray-100 px-4 py-3 text-sm">
      <span className="text-gray-500">
        Page {page} of {pages}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={makeHref(page - 1)} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 ring-1 ring-gray-300 hover:bg-gray-50">
            <ChevronLeft className="h-4 w-4" /> Prev
          </Link>
        ) : null}
        {page < pages ? (
          <Link href={makeHref(page + 1)} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 ring-1 ring-gray-300 hover:bg-gray-50">
            Next <ChevronRight className="h-4 w-4" />
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

export function DescriptionList({ items, className }: { items: { label: ReactNode; value: ReactNode; hidden?: boolean }[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2", className)}>
      {items
        .filter((i) => !i.hidden)
        .map((i, idx) => (
          <div key={idx} className="min-w-0">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{i.label}</dt>
            <dd className="mt-1 break-words text-sm text-gray-900">{i.value || "—"}</dd>
          </div>
        ))}
    </dl>
  );
}

export function Alert({ tone = "blue", title, children, action }: { tone?: "blue" | "amber" | "red" | "green"; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const tones = {
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-red-200 bg-red-50 text-red-900",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
  };
  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between", tones[tone])}>
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && "mt-0.5", "opacity-90")}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const parts = name.split(" ");
  const initials = `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  return (
    <span className={cn("inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800", className)}>
      {initials}
    </span>
  );
}
