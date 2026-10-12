import { afterEach, describe, expect, it, vi } from "vitest";

describe("sendEmail", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("passes Resend's error message through so admins can see why sending failed", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ statusCode: 403, message: "The teasooconsulting.com domain is not verified." }), { status: 403 })),
    );
    const { sendEmail } = await import("./email");
    const r = await sendEmail({ to: "a@b.com", subject: "s", html: "h", text: "t" });
    expect(r).toEqual({ ok: false, error: "Email provider error (403): The teasooconsulting.com domain is not verified." });
  });
});

describe("emailFromProblem", () => {
  it("accepts plain and named addresses, rejects incomplete ones", async () => {
    const { emailFromProblem } = await import("./config");
    expect(emailFromProblem("Teasoo Expense <notifications@expense.teasooconsulting.com>")).toBeNull();
    expect(emailFromProblem("notifications@expense.teasooconsulting.com")).toBeNull();
    expect(emailFromProblem("@expense.teasooconsulting.com")).toMatch(/isn't a valid sender/);
    expect(emailFromProblem("Teasoo <expense.teasooconsulting.com>")).toMatch(/isn't a valid sender/);
  });
});

describe("sender fallback", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });
  it("uses the verified default sender when EMAIL_FROM is invalid, and warns", async () => {
    vi.stubEnv("EMAIL_FROM", "@expense.teasooconsulting.com");
    const { config, emailFromWarning } = await import("./config");
    expect(config.email.from).toBe("Teasoo Expense <notifications@expense.teasooconsulting.com>");
    expect(emailFromWarning()).toMatch(/Using Teasoo Expense <notifications@expense.teasooconsulting.com> instead/);
  });
});
