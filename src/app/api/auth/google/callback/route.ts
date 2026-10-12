import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode, GOOGLE_STATE_COOKIE } from "@/lib/auth/google";
import { signInWithGoogle } from "@/lib/services/auth";

function fail(req: NextRequest, message: string) {
  const url = new URL("/login", req.url);
  url.searchParams.set("error", message);
  const res = NextResponse.redirect(url);
  res.cookies.delete({ name: GOOGLE_STATE_COOKIE, path: "/api/auth/google" });
  return res;
}

/** Google redirects here with ?code&state after the user picks an account. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (sp.get("error")) return fail(req, sp.get("error") === "access_denied" ? "Google sign-in was cancelled." : "Google sign-in failed.");
  let saved: { state: string; nonce: string; verifier: string; next: string };
  try {
    saved = JSON.parse(req.cookies.get(GOOGLE_STATE_COOKIE)?.value ?? "");
  } catch {
    return fail(req, "Your sign-in session expired. Please try again.");
  }
  const code = sp.get("code");
  if (!code || sp.get("state") !== saved.state) return fail(req, "Sign-in request did not match. Please try again.");
  try {
    const identity = await exchangeCode(code, saved.verifier, saved.nonce);
    await signInWithGoogle(identity);
  } catch (e) {
    console.error("[google-auth]", e);
    return fail(req, e instanceof Error && e.message.length < 200 ? e.message : "Google sign-in failed.");
  }
  const res = NextResponse.redirect(new URL(saved.next || "/dashboard", req.url));
  res.cookies.delete({ name: GOOGLE_STATE_COOKIE, path: "/api/auth/google" });
  return res;
}
