import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, ORG_COOKIE } from "@/lib/auth/current";

/** Only same-site paths, never protocol-relative URLs. */
function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/dashboard";
}

/**
 * Switches the organisation the person is working in, then opens `next`.
 * Used by the organisation menu and by links to records that live in another organisation.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  const orgId = req.nextUrl.searchParams.get("org");
  const target = user.organisations.find((o) => o.organisationId === orgId);
  const res = NextResponse.redirect(new URL(target ? safeNext(req.nextUrl.searchParams.get("next")) : "/dashboard", req.url));
  if (target) {
    res.cookies.set(ORG_COOKIE, target.organisationId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return res;
}
