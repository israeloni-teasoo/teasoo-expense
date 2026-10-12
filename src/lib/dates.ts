export const TIMEZONE = "Africa/Lagos";

/** Today's date (YYYY-MM-DD) in the organisation's timezone. */
export function todayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(now);
}

export function isISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso + "T00:00:00Z").getTime();
  const b = new Date(toIso + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86_400_000);
}

export function formatDate(value: string | Date | null | undefined, style: "short" | "medium" | "long" = "medium"): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value.length === 10 ? value + "T12:00:00Z" : value) : value;
  const opts: Intl.DateTimeFormatOptions =
    style === "short"
      ? { day: "numeric", month: "short" }
      : style === "long"
        ? { day: "numeric", month: "long", year: "numeric" }
        : { day: "2-digit", month: "short", year: "numeric" };
  return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: TIMEZONE }).format(d);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: TIMEZONE,
  }).format(d);
}

export function relativeTime(value: Date | string | null | undefined, now: Date = new Date()): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  const diff = Math.round((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const days = Math.floor(diff / 86400);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return formatDate(d);
}

export const PERIODS = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "this_quarter", label: "This quarter" },
  { value: "this_year", label: "This year" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range" },
] as const;

export type Period = (typeof PERIODS)[number]["value"];

/** Resolve a reporting period to an inclusive [from, to] date range (null = unbounded). */
export function resolvePeriod(
  period: string | undefined,
  custom: { from?: string; to?: string } = {},
  today: string = todayISO(),
): { from: string | null; to: string | null; label: string } {
  const [y, m] = today.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const monthStart = (yy: number, mm: number) => `${yy}-${pad(mm)}-01`;
  const monthEnd = (yy: number, mm: number) => {
    const d = new Date(Date.UTC(yy, mm, 0));
    return d.toISOString().slice(0, 10);
  };
  const label = (from: string | null, to: string | null) =>
    from && to ? `${formatDate(from, "long")} – ${formatDate(to, "long")}` : from ? `From ${formatDate(from, "long")}` : to ? `Until ${formatDate(to, "long")}` : "All time";

  switch (period) {
    case "today":
      return { from: today, to: today, label: label(today, today) };
    case "this_week": {
      const dow = new Date(today + "T00:00:00Z").getUTCDay(); // 0 = Sunday
      const from = addDays(today, -((dow + 6) % 7)); // weeks start on Monday
      const to = addDays(from, 6);
      return { from, to, label: label(from, to) };
    }
    case "this_month": {
      const from = monthStart(y, m);
      const to = monthEnd(y, m);
      return { from, to, label: label(from, to) };
    }
    case "last_month": {
      const yy = m === 1 ? y - 1 : y;
      const mm = m === 1 ? 12 : m - 1;
      const from = monthStart(yy, mm);
      const to = monthEnd(yy, mm);
      return { from, to, label: label(from, to) };
    }
    case "this_quarter": {
      const q = Math.floor((m - 1) / 3);
      const from = monthStart(y, q * 3 + 1);
      const to = monthEnd(y, q * 3 + 3);
      return { from, to, label: label(from, to) };
    }
    case "this_year": {
      const from = `${y}-01-01`;
      const to = `${y}-12-31`;
      return { from, to, label: label(from, to) };
    }
    case "custom": {
      const from = custom.from && isISODate(custom.from) ? custom.from : null;
      const to = custom.to && isISODate(custom.to) ? custom.to : null;
      return { from, to, label: label(from, to) };
    }
    default:
      return { from: null, to: null, label: "All time" };
  }
}
