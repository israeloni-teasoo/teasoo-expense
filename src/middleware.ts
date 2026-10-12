import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password", "/api/health", "/api/auth"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  if (!session && !isPublic) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname !== "/" && pathname !== "/dashboard" ? `?next=${encodeURIComponent(pathname + req.nextUrl.search)}` : "";
    return NextResponse.redirect(url);
  }
  if (session && (pathname === "/login" || pathname === "/")) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)"],
};
