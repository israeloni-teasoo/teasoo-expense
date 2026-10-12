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
