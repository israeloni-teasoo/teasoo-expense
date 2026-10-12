import { api, jsonBody, os, s } from "@/lib/api";
import { reconcileAllocation } from "@/lib/services/allocations";

/** POST /api/reconciliations { allocationId, notes? } */
export const POST = api(async (user, req) => {
  const b = await jsonBody(req);
  await reconcileAllocation(user, s(b.allocationId), os(b.notes));
  return { ok: true };
}, "allocations.reconcile");
