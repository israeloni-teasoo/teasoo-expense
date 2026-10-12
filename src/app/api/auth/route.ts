import { NextResponse } from "next/server";
import { DomainError } from "@/lib/errors";
import { login, logout } from "@/lib/services/auth";

/** POST /api/auth { email, password } — signs in and sets the session cookie. DELETE signs out. */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const user = await login(String(body.email ?? ""), String(body.password ?? ""));
    return NextResponse.json({ id: user.id, name: `${user.firstName} ${user.lastName}`, role: user.role });
  } catch (e) {
    if (e instanceof DomainError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }
}

export async function DELETE() {
  await logout();
  return NextResponse.json({ ok: true });
}
