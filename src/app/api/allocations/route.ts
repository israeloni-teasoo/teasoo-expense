import { api, apiMoney, jsonBody, os, s } from "@/lib/api";
import { serializeAllocation } from "@/lib/api-serializers";
import { createAllocation, listAllocations } from "@/lib/services/allocations";

/** GET /api/allocations?status=&staff=&q= — own allocations for staff, all for finance. */
export const GET = api(async (user, req) => {
  const u = new URL(req.url).searchParams;
  const rows = await listAllocations(user, { q: u.get("q") ?? undefined, staffId: u.get("staff") ?? undefined, status: u.get("status") ?? undefined, scope: u.get("scope") === "mine" ? "mine" : undefined });
  return { data: rows.map(serializeAllocation) };
});

/** POST /api/allocations { staffId, amount (naira), purpose, dateReceived, … } */
export const POST = api(async (user, req) => {
  const b = await jsonBody(req);
  const row = await createAllocation(user, {
    staffId: s(b.staffId),
    amount: apiMoney(b.amount),
    purpose: s(b.purpose),
    dateReceived: s(b.dateReceived),
    expectedCompletionDate: os(b.expectedCompletionDate),
    departmentId: os(b.departmentId),
    projectId: os(b.projectId),
    transferReference: os(b.transferReference),
    fundingSource: os(b.fundingSource),
    approvingOfficer: os(b.approvingOfficer),
    notes: os(b.notes),
  });
  return Response.json({ id: row.id, reference: row.reference }, { status: 201 });
}, "allocations.create");
