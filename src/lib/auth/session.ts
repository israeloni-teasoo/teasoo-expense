import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "tx_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

export type SessionPayload = { sub: string; role: string; org: string };

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must be set to a random string of at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ role: payload.role, org: payload.org })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    return { sub: payload.sub, role: String(payload.role), org: String(payload.org) };
  } catch {
    return null;
  }
}
