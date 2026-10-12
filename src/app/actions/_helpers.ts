import { DomainError } from "@/lib/errors";
import { parseMoney } from "@/lib/money";

export const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
};
export const opt = (fd: FormData, key: string) => str(fd, key) || null;
export const bool = (fd: FormData, key: string) => ["1", "on", "true", "yes"].includes(str(fd, key));

export function money(fd: FormData, key: string, { required = true, allowNegative = false } = {}): number | null {
  const raw = str(fd, key);
  if (!raw) {
    if (required) throw new DomainError("Enter an amount.", "VALIDATION", { [key]: "Enter an amount." });
    return null;
  }
  const v = parseMoney(raw);
  if (v == null || (!allowNegative && v < 0))
    throw new DomainError("Enter a valid amount, e.g. 85,000 or 85000.50.", "VALIDATION", { [key]: "Enter a valid amount." });
  return v;
}
