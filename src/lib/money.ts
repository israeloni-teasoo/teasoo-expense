/**
 * Money helpers. Amounts are integers in the minor unit (kobo). JavaScript numbers
 * represent integers exactly up to 2^53, which is ~90 trillion naira, so integer
 * kobo arithmetic is exact. Never multiply user-entered decimals by 100 as floats.
 */

export const CURRENCY = "NGN";
const MAX_KOBO = Number.MAX_SAFE_INTEGER;

/** Parse "85,000", "₦85,000.50" or "85000.5" into kobo. Returns null if invalid. */
export function parseMoney(input: unknown): number | null {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    input = input.toString();
  }
  if (typeof input !== "string") return null;
  const cleaned = input.replace(/[₦,\s]/g, "").replace(/^NGN/i, "");
  const match = /^(-)?(\d+)(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!match) return null;
  const [, sign, whole, frac = ""] = match;
  const kobo = BigInt(whole) * 100n + BigInt((frac + "00").slice(0, 2));
  if (kobo > BigInt(MAX_KOBO)) return null;
  const value = Number(kobo);
  return sign ? -value : value;
}

/** Convert kobo to a plain decimal string suitable for form inputs ("85000.50" / "85000"). */
export function koboToInput(kobo: number | null | undefined): string {
  if (kobo == null) return "";
  const negative = kobo < 0;
  const abs = Math.abs(kobo);
  const whole = Math.trunc(abs / 100);
  const frac = abs % 100;
  return `${negative ? "-" : ""}${whole}${frac ? "." + String(frac).padStart(2, "0") : ""}`;
}

const nairaFormatter = new Intl.NumberFormat("en-NG", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** ₦85,000 / ₦85,000.50 / -₦50,000 */
export function formatMoney(kobo: number | null | undefined, opts: { sign?: boolean; symbol?: string } = {}): string {
  const value = kobo ?? 0;
  const symbol = opts.symbol ?? "₦";
  const negative = value < 0;
  const abs = Math.abs(value);
  const whole = Math.trunc(abs / 100);
  const frac = abs % 100;
  const body = nairaFormatter.format(whole) + (frac ? "." + String(frac).padStart(2, "0") : "");
  const prefix = negative ? "-" : opts.sign && value > 0 ? "+" : "";
  return `${prefix}${symbol}${body}`;
}

/** Compact display for charts and tables: ₦500k, ₦1.2m. */
export function formatMoneyCompact(kobo: number | null | undefined): string {
  const naira = (kobo ?? 0) / 100;
  const abs = Math.abs(naira);
  const sign = naira < 0 ? "-" : "";
  const trim = (n: number) => (Math.round(n * 10) / 10).toString();
  if (abs >= 1_000_000_000) return `${sign}₦${trim(abs / 1_000_000_000)}bn`;
  if (abs >= 1_000_000) return `${sign}₦${trim(abs / 1_000_000)}m`;
  if (abs >= 1_000) return `${sign}₦${trim(abs / 1_000)}k`;
  return `${sign}₦${trim(abs)}`;
}

/** Kobo to a naira number for spreadsheet cells. Division by 100 is display-only. */
export function koboToNaira(kobo: number): number {
  return kobo / 100;
}

export function sumKobo(values: Iterable<number>): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

export function percent(part: number, whole: number): number {
  if (whole <= 0) return part > 0 ? 100 : 0;
  return Math.round((part / whole) * 100);
}
