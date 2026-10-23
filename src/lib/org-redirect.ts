import "server-only";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { allocations, expenses, requisitions } from "@/db/schema";
import { redirectToOwningOrganisation, type CurrentUser } from "@/lib/auth/current";

/**
 * For detail pages whose record wasn't found in the active organisation: if it belongs to another
 * organisation the person works in (e.g. a link from an email), switch there and reopen the page;
 * otherwise show "not found".
 */
export async function notFoundOrSwitch(user: CurrentUser, kind: "allocation" | "expense" | "requisition", id: string, path: string): Promise<never> {
  if (/^[0-9a-f-]{36}$/i.test(id)) {
    const orgId =
      kind === "requisition"
        ? (await db.select({ org: requisitions.organisationId }).from(requisitions).where(eq(requisitions.id, id)).limit(1))[0]?.org
        : kind === "allocation"
        ? (await db.select({ org: allocations.organisationId }).from(allocations).where(eq(allocations.id, id)).limit(1))[0]?.org
        : (
            await db
              .select({ org: allocations.organisationId })
              .from(expenses)
              .innerJoin(allocations, eq(allocations.id, expenses.allocationId))
              .where(eq(expenses.id, id))
              .limit(1)
          )[0]?.org;
    await redirectToOwningOrganisation(user, orgId, path);
  }
  notFound();
}
