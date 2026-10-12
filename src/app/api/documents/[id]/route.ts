import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current";
import { canAccessDocument } from "@/lib/services/expenses";
import { storage } from "@/lib/storage";

/** Private, access-checked file delivery. Receipts never have permanent public URLs. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const doc = await db.query.documents.findFirst({ where: and(eq(documents.id, id), eq(documents.organisationId, user.organisationId)) });
  if (!doc || !(await canAccessDocument(user, doc))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Soft-deleted files remain available to finance for audit purposes only.
  if (doc.deletedAt && user.role === "STAFF") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const download = req.nextUrl.searchParams.get("download") === "1";
  const driver = storage();

  // Object storage: after the access check, hand the browser a 2-minute signed URL so large
  // files don't stream through the serverless function. The URL is never stored or shown.
  if (driver.signedUrl) {
    try {
      const url = await driver.signedUrl(doc.storageKey, { expiresIn: 120, downloadName: download ? doc.fileName : undefined });
      if (url) return NextResponse.redirect(url, { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
    } catch (e) {
      console.error(e);
      return NextResponse.json({ error: "File unavailable" }, { status: 502 });
    }
  }

  let data: Buffer;
  try {
    data = await driver.get(doc.storageKey);
  } catch {
    return NextResponse.json({ error: "File missing from storage" }, { status: 410 });
  }
  const name = doc.fileName.replace(/"/g, "");
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": doc.fileType,
      "Content-Length": String(data.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
