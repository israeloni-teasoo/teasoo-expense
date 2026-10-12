/**
 * Turns raw OCR text from a receipt into suggested expense fields. OCR output is noisy, so
 * every value is a suggestion the staff member confirms before submitting (spec §11).
 */
import { parseMoney } from "./money";

export type ReceiptFields = {
  /** Total in kobo. */
  amount: number | null;
  /** YYYY-MM-DD */
  date: string | null;
  vendor: string | null;
  receiptNumber: string | null;
  /** VAT / tax in kobo, when printed. */
  tax: number | null;
};

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

// "45,500.00", "45500", "45.500,00" is not Nigerian style so not supported. OCR often reads ₦ as N, # or H.
const AMOUNT_RE = /(?:₦|ngn|n|#|h)?\s*(\d{1,3}(?:[,\s]\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?![\d/:-])/gi;

function amountsIn(line: string): number[] {
  const out: number[] = [];
  for (const m of line.matchAll(AMOUNT_RE)) {
    const raw = m[1].replace(/\s/g, ",");
    // Skip things that are clearly not money: years, 1-digit counts, long ids / phone numbers.
    const digits = raw.replace(/\D/g, "");
    if (digits.length > 12) continue;
    const kobo = parseMoney(raw);
    if (kobo != null && kobo > 0) out.push(kobo);
  }
  return out;
}

/** Lines that state the amount actually paid, strongest first. */
const TOTAL_PATTERNS: RegExp[] = [
  /grand\s*total/i,
  /total\s*(amount\s*)?(due|payable|paid)/i,
  /amount\s*(due|payable|paid)/i,
  /\bnet\s*(total|amount)/i,
  /^(?!.*sub\s*-?\s*total)(?!.*total\s*(qty|items?|quantity)).*\btotal\b/i,
  /\bbalance\s*(due)?\b/i,
  /\b(cash|card|pos|transfer)\s*(paid|payment)?\b/i,
];

export function parseAmount(lines: string[]): number | null {
  for (const pattern of TOTAL_PATTERNS) {
    for (let i = lines.length - 1; i >= 0; i--) {
      // The figure is usually on the same line, occasionally on the next one.
      if (!pattern.test(lines[i])) continue;
      const here = amountsIn(lines[i].replace(pattern, " "));
      const candidates = here.length ? here : amountsIn(lines[i + 1] ?? "");
      if (candidates.length) return Math.max(...candidates);
    }
  }
  // Fallback: the largest money-looking figure with decimals or thousands separators.
  const all = lines.flatMap((l) => (/[.,]\d{2}\b|\d,\d{3}/.test(l) ? amountsIn(l) : []));
  return all.length ? Math.max(...all) : null;
}

function iso(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return dt.toISOString().slice(0, 10);
}

/** Receipts in Nigeria print day-first dates (08/10/2026 = 8 October). */
export function parseDate(text: string, today?: string): string | null {
  const found: string[] = [];
  const t = text.replace(/[|]/g, "/");
  for (const m of t.matchAll(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/g)) {
    const v = iso(+m[1], +m[2], +m[3]);
    if (v) found.push(v);
  }
  for (const m of t.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?!\d)/g)) {
    const v = iso(+m[3], +m[2], +m[1]) ?? iso(+m[3], +m[1], +m[2]);
    if (v) found.push(v);
  }
  for (const m of t.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?[\s-]+([a-z]{3,9})[,\s-]+(\d{2,4})\b/gi)) {
    const month = MONTHS[m[2].slice(0, 4).toLowerCase()] ?? MONTHS[m[2].slice(0, 3).toLowerCase()];
    const v = month ? iso(+m[3], month, +m[1]) : null;
    if (v) found.push(v);
  }
  for (const m of t.matchAll(/\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/gi)) {
    const month = MONTHS[m[1].slice(0, 4).toLowerCase()] ?? MONTHS[m[1].slice(0, 3).toLowerCase()];
    const v = month ? iso(+m[3], month, +m[2]) : null;
    if (v) found.push(v);
  }
  const valid = today ? found.filter((d) => d <= today) : found;
  return valid[0] ?? null;
}

const NOT_VENDOR = /\b(receipt|invoice|tax|vat|tin|rc\s*no|tel|phone|date|time|cashier|till|customer|welcome|thank|order|table|bill|copy|original|address|street|road|www\.|http|@)\b/i;

export function parseVendor(lines: string[]): string | null {
  for (const raw of lines.slice(0, 6)) {
    const line = raw.replace(/[^\p{L}\p{N}&'.,\- ]/gu, " ").replace(/\s+/g, " ").trim();
    const letters = (line.match(/\p{L}/gu) ?? []).length;
    if (line.length < 3 || letters < 3 || letters / line.length < 0.6) continue;
    if (NOT_VENDOR.test(line)) continue;
    if (/^\d/.test(line)) continue;
    // Title-case shouty headers: "ABC OFFICE SUPPLIES LTD" → "Abc Office Supplies Ltd"
    const pretty = line === line.toUpperCase() ? line.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : line;
    return pretty.slice(0, 80);
  }
  return null;
}

export function parseReceiptNumber(text: string): string | null {
  const m =
    /\b(?:receipt|invoice|inv|bill|txn|transaction|ref|order)\s*(?:no\.?|number|num|#|id)?\s*[:#.]?\s*([A-Z0-9][A-Z0-9/-]{2,24})/i.exec(text) ??
    /\b(INV|RCT|RCPT|REC)[-\s]?(\d{3,})\b/i.exec(text);
  if (!m) return null;
  const value = m[2] && /^\d+$/.test(m[2]) ? `${m[1]}-${m[2]}` : m[1];
  // Avoid picking up words such as "Receipt Copy".
  return /\d/.test(value) ? value.toUpperCase() : null;
}

export function parseTax(lines: string[]): number | null {
  for (const line of lines) {
    if (!/\b(vat|tax)\b/i.test(line) || /\b(tin|vat\s*no|tax\s*id|reg)\b/i.test(line)) continue;
    const amounts = amountsIn(line.replace(/\d+(\.\d+)?\s*%/g, " "));
    if (amounts.length) return Math.max(...amounts);
  }
  return null;
}

export function parseReceiptText(text: string, today?: string): ReceiptFields {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return {
    amount: parseAmount(lines),
    date: parseDate(text, today),
    vendor: parseVendor(lines),
    receiptNumber: parseReceiptNumber(text),
    tax: parseTax(lines),
  };
}
