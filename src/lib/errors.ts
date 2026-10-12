/** An expected, user-facing failure (validation, permission, business rule). */
export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: "VALIDATION" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "RULE" = "RULE",
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

/** A soft validation failure the user may override after confirming (e.g. possible duplicate). */
export class ConfirmationRequired extends DomainError {
  constructor(
    message: string,
    public readonly kind: "DUPLICATE" | "OVER_BUDGET",
  ) {
    super(message, "RULE");
    this.name = "ConfirmationRequired";
  }
}

export const forbidden = (msg = "You do not have permission to do that.") => new DomainError(msg, "FORBIDDEN");
export const notFound = (msg = "Not found.") => new DomainError(msg, "NOT_FOUND");

export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T; redirectTo?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; warning?: { kind: string; message: string } };

export function toActionError(err: unknown): ActionResult<never> {
  if (err instanceof ConfirmationRequired) return { ok: false, error: err.message, warning: { kind: err.kind, message: err.message } };
  if (err instanceof DomainError) return { ok: false, error: err.message, fieldErrors: err.fieldErrors };
  // Re-throw Next.js control-flow errors (redirect / notFound).
  if (err && typeof err === "object" && "digest" in err && typeof (err as { digest: unknown }).digest === "string") {
    const digest = (err as { digest: string }).digest;
    if (digest.startsWith("NEXT_")) throw err;
  }
  console.error(err);
  return { ok: false, error: "Something went wrong. Please try again." };
}
