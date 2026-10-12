import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organisations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current";
import { storage } from "@/lib/storage";

/** An organisation's logo, for people who belong to it. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const allowed = user.organisations.some((o) => o.organisationId === id) || user.isGroupAdmin;
  if (!allowed || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const org = await db.query.organisations.findFirst({ where: eq(organisations.id, id) });
  if (!org?.logoKey || !org.logoType?.startsWith("image/")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let data: Buffer;
  try {
    data = await storage().get(org.logoKey);
  } catch {
    return NextResponse.json({ error: "Logo missing from storage" }, { status: 410 });
  }
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": org.logoType,
      "Content-Length": String(data.length),
      // The URL carries a version (?v=updatedAt), so it can be cached.
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
