import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/current";
import { ConfirmationRequired, DomainError } from "@/lib/errors";
import { can, type Permission } from "@/lib/rbac";
import { parseMoney } from "@/lib/money";

const STATUS = { VALIDATION: 422, FORBIDDEN: 403, NOT_FOUND: 404, CONFLICT: 409, RULE: 422 } as const;

/** Wraps a JSON API handler with authentication, permission checks and consistent error responses. */
export function api<C>(handler: (user: CurrentUser, req: Request, ctx: C) => Promise<unknown>, permission?: Permission) {
  return async (req: Request, ctx: C) => {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (permission && !can(user.role, permission)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    try {
      const data = await handler(user, req, ctx);
      return data instanceof Response ? data : NextResponse.json(data ?? { ok: true });
    } catch (e) {
      if (e instanceof ConfirmationRequired)
        return NextResponse.json({ error: e.message, confirmationRequired: e.kind, hint: `Resend with "confirm${e.kind === "DUPLICATE" ? "Duplicate" : "OverBudget"}": true` }, { status: 409 });
      if (e instanceof DomainError) return NextResponse.json({ error: e.message, fieldErrors: e.fieldErrors }, { status: STATUS[e.code] });
      console.error(e);
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
  };
}

export async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch {
    throw new DomainError("Request body must be a JSON object.", "VALIDATION");
  }
}

export const s = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));
export const os = (v: unknown) => s(v) || null;

/**
 * API amounts are naira (e.g. 85000 or "85000.50") and are converted to kobo without floating-point
 * arithmetic. Responses report both `amount` (naira, as a decimal string) and `amountKobo`.
 */
export function apiMoney(v: unknown, field = "amount"): number {
  const k = parseMoney(typeof v === "number" ? v.toString() : v);
  if (k == null) throw new DomainError(`"${field}" must be a valid amount in naira.`, "VALIDATION", { [field]: "Invalid amount" });
  return k;
}

export function nairaString(kobo: number) {
  const neg = kobo < 0;
  const a = Math.abs(kobo);
  return `${neg ? "-" : ""}${Math.trunc(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}
