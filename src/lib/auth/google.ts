import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { config } from "@/lib/config";

/**
 * Google OpenID Connect (authorization code flow with PKCE).
 * https://developers.google.com/identity/openid-connect/openid-connect
 */
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export const GOOGLE_STATE_COOKIE = "tx_google";
export const CALLBACK_PATH = "/api/auth/google/callback";

/**
 * The callback URL is built from the domain the person is actually using (not APP_URL), so a
 * stale or mistyped APP_URL can't cause Google's redirect_uri_mismatch. Every domain people sign
 * in from must still be listed under "Authorised redirect URIs" on the Google OAuth client.
 */
export function redirectUriFor(origin: string) {
  return `${origin.replace(/\/$/, "")}${CALLBACK_PATH}`;
}

export function createAuthRequest(next: string, redirectUri: string) {
  const state = randomBytes(16).toString("base64url");
  const nonce = randomBytes(16).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    // Shows only accounts on the company domain in Google's account chooser (UX hint; enforced in the callback).
    hd: config.companyDomain,
    prompt: "select_account",
  }).toString();
  return { url: url.toString(), cookie: JSON.stringify({ state, nonce, verifier, next, redirectUri }) };
}

export type GoogleIdentity = { sub: string; email: string; firstName: string; lastName: string };

/** Pure check of the ID token claims, so the domain rule is unit-testable. */
export function validateGoogleClaims(claims: JWTPayload & Record<string, unknown>, expected: { nonce: string; domain: string }): GoogleIdentity {
  if (claims.nonce !== expected.nonce) throw new Error("Sign-in request did not match. Please try again.");
  const email = String(claims.email ?? "").toLowerCase();
  if (!email || claims.email_verified !== true) throw new Error("Your Google account email is not verified.");
  // `hd` is only present for Google Workspace accounts; require it to equal the company domain.
  if (claims.hd !== expected.domain || !email.endsWith("@" + expected.domain)) {
    throw new Error(`Sign in with your @${expected.domain} Google account.`);
  }
  if (!claims.sub) throw new Error("Google did not return an account id.");
  const given = String(claims.given_name ?? "").trim();
  const family = String(claims.family_name ?? "").trim();
  const fallback = String(claims.name ?? email.split("@")[0]).trim().split(/\s+/);
  return {
    sub: String(claims.sub),
    email,
    firstName: given || fallback[0] || "Staff",
    lastName: family || fallback.slice(1).join(" ") || "-",
  };
}

export async function exchangeCode(code: string, verifier: string, nonce: string, redirectUri: string): Promise<GoogleIdentity> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new Error("Google sign-in failed. Please try again.");
  const tokens = (await res.json()) as { id_token?: string };
  if (!tokens.id_token) throw new Error("Google sign-in failed. Please try again.");
  const { payload } = await jwtVerify(tokens.id_token, JWKS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: config.google.clientId,
  });
  return validateGoogleClaims(payload as JWTPayload & Record<string, unknown>, { nonce, domain: config.companyDomain });
}
