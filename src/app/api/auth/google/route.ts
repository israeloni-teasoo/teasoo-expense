import { NextResponse, type NextRequest } from "next/server";
import { createAuthRequest, GOOGLE_STATE_COOKIE, redirectUriFor } from "@/lib/auth/google";
import { googleEnabled } from "@/lib/config";

/** GET /api/auth/google?next=/path — redirects to Google's sign-in page. */
export async function GET(req: NextRequest) {
  if (!googleEnabled()) return NextResponse.redirect(new URL("/login?error=google_not_configured", req.url));
  const nextParam = req.nextUrl.searchParams.get("next") ?? "";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard";
  const redirectUri = redirectUriFor(requestOrigin(req));
  const { url, cookie } = createAuthRequest(next, redirectUri);
  console.info(`[google-auth] redirect_uri=${redirectUri}`);
  const res = NextResponse.redirect(url);
  res.cookies.set(GOOGLE_STATE_COOKIE, cookie, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth/google",
    maxAge: 600,
  });
  return res;
}

/** The public origin of this request (Vercel sets x-forwarded-host / x-forwarded-proto). */
function requestOrigin(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host")?.split(",")[0].trim() || req.headers.get("host") || req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() || req.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}
