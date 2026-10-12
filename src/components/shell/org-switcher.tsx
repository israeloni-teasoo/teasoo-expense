"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Settings2 } from "lucide-react";
import { cn } from "@/lib/cn";

export type SwitcherOrg = { id: string; name: string; logoUrl: string | null; role: string };

export function OrgMark({ org, size = "md", light }: { org: { name: string; logoUrl: string | null }; size?: "sm" | "md"; light?: boolean }) {
  const box = size === "sm" ? "h-7 w-7 text-[11px]" : "h-9 w-9 text-xs";
  if (org.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={org.logoUrl} alt="" className={cn(box, "shrink-0 rounded-lg bg-white object-contain p-0.5")} />
    );
  }
  const initials = org.name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z0-9]/.test(w))
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span className={cn(box, "flex shrink-0 items-center justify-center rounded-lg font-bold", light ? "bg-white text-brand-800" : "bg-brand-700 text-white")} aria-hidden>
      {initials || "T"}
    </span>
  );
}

/**
 * The organisation (company/subsidiary) the person is working in, with a menu to switch.
 * Switching uses plain links (not prefetched) to a route that sets the organisation cookie.
 */
export function OrgSwitcher({
  orgs,
  activeId,
  manageHref,
  variant,
}: {
  orgs: SwitcherOrg[];
  activeId: string;
  /** Group admins get a shortcut to manage organisations. */
  manageHref?: string | null;
  variant: "sidebar" | "topbar";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = orgs.find((o) => o.id === activeId) ?? orgs[0];
  const switchable = orgs.length > 1 || !!manageHref;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!active) return null;
  const sidebar = variant === "sidebar";
  const label = (
    <>
      <OrgMark org={active} size={sidebar ? "md" : "sm"} light={sidebar} />
      <span className="min-w-0 flex-1 text-left">
        <span className={cn("block truncate font-semibold leading-5", sidebar ? "text-sm text-white" : "max-w-[9rem] text-sm text-gray-900 sm:max-w-[14rem]")}>{active.name}</span>
        {sidebar && <span className="block truncate text-[11px] leading-4 text-brand-200">Funds & Expenses</span>}
      </span>
    </>
  );

  if (!switchable) return <div className={cn("flex min-w-0 items-center gap-2.5", sidebar && "w-full")}>{label}</div>;

  return (
    <div ref={ref} className={cn("relative min-w-0", sidebar && "w-full")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Organisation: ${active.name}. Switch organisation`}
        data-testid="org-switcher"
        className={cn(
          "flex min-w-0 items-center gap-2.5 rounded-lg transition-colors",
          sidebar ? "w-full px-2 py-1.5 hover:bg-brand-800/60" : "px-1.5 py-1 hover:bg-gray-100",
        )}
      >
        {label}
        <ChevronsUpDown className={cn("h-4 w-4 shrink-0", sidebar ? "text-brand-200" : "text-gray-400")} />
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            "absolute z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg",
            sidebar ? "left-0 right-0" : "left-0 w-72 max-w-[calc(100vw-2rem)]",
          )}
        >
          <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Switch organisation</p>
          {orgs.map((o) => (
            <a
              key={o.id}
              role="menuitem"
              href={o.id === active.id ? "/dashboard" : `/api/org/switch?org=${o.id}&next=/dashboard`}
              className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-gray-50", o.id === active.id && "bg-brand-50")}
            >
              <OrgMark org={o} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-gray-900">{o.name}</span>
                <span className="block truncate text-xs text-gray-500">{o.role}</span>
              </span>
              {o.id === active.id && <Check className="h-4 w-4 shrink-0 text-brand-700" />}
            </a>
          ))}
          {manageHref && (
            <a href={manageHref} role="menuitem" className="mt-1 flex items-center gap-2.5 rounded-lg border-t border-gray-100 px-2.5 py-2 text-sm font-medium text-brand-700 hover:bg-gray-50">
              <Settings2 className="h-4 w-4" /> Manage organisations
            </a>
          )}
        </div>
      )}
    </div>
  );
}
