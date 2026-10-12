"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth/current";
import { type ActionResult, toActionError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import {
  addAdjustment,
  createAllocation,
  createPersonalSpendRecord,
  reconcileAllocation,
  recordReturn,
  setAllocationStatus,
  settlePersonalSpend,
  updateAllocationDetails,
} from "@/lib/services/allocations";
import { filesFrom } from "@/lib/storage";
import type { AdjustmentType } from "@/db/schema";
import { money, opt, str } from "./_helpers";

type Prev = ActionResult<unknown> | null;

export async function createAllocationAction(_: Prev, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor("allocations.create");
    const row = await createAllocation(
      actor,
      {
        staffId: str(fd, "staffId"),
        amount: money(fd, "amount")!,
        purpose: str(fd, "purpose"),
        dateReceived: str(fd, "dateReceived"),
        expectedCompletionDate: opt(fd, "expectedCompletionDate"),
        departmentId: opt(fd, "departmentId"),
        projectId: opt(fd, "projectId"),
        transferReference: opt(fd, "transferReference"),
        fundingSource: opt(fd, "fundingSource"),
        approvingOfficer: opt(fd, "approvingOfficer"),
        notes: opt(fd, "notes"),
      },
      filesFrom(fd, "transferReceipt")[0] ?? null,
    );
    revalidatePath("/", "layout");
    return { ok: true, message: `Allocation ${row.reference} created and the staff member notified.`, redirectTo: `/allocations/${row.id}` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function createPersonalSpendAction(_: Prev, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor("funds.own");
    const row = await createPersonalSpendRecord(actor, { purpose: str(fd, "purpose"), projectId: opt(fd, "projectId"), dateReceived: opt(fd, "date") ?? undefined });
    revalidatePath("/", "layout");
    return { ok: true, message: "Personal spend record created. Add the expenses you paid for.", redirectTo: `/expenses/new?allocation=${row.id}` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateAllocationAction(_: Prev, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor("allocations.create");
    await updateAllocationDetails(actor, str(fd, "allocationId"), {
      purpose: str(fd, "purpose"),
      expectedCompletionDate: opt(fd, "expectedCompletionDate"),
      projectId: opt(fd, "projectId"),
      departmentId: opt(fd, "departmentId"),
      notes: opt(fd, "notes"),
      transferReference: opt(fd, "transferReference"),
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Allocation updated." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function addFundingAction(_: Prev, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor("allocations.create");
    const type = (str(fd, "type") || "ADDITIONAL_FUNDING") as AdjustmentType;
    await addAdjustment(actor, str(fd, "allocationId"), {
      type,
      amount: money(fd, "amount", { allowNegative: type === "CORRECTION" })!,
      reason: str(fd, "reason"),
      reference: opt(fd, "reference"),
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Funding added. Balances updated." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function recordReturnAction(_: Prev, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor("returns.record");
    await recordReturn(
      actor,
      str(fd, "allocationId"),
      {
        amount: money(fd, "amount")!,
        returnDate: str(fd, "returnDate"),
        paymentMethod: opt(fd, "paymentMethod"),
        reference: opt(fd, "reference"),
        notes: opt(fd, "notes"),
      },
      filesFrom(fd, "evidence")[0] ?? null,
    );
    revalidatePath("/", "layout");
    return { ok: true, message: "Return recorded." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function reconcileAction(_: Prev, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor("allocations.reconcile");
    await reconcileAllocation(actor, str(fd, "allocationId"), opt(fd, "notes"));
    revalidatePath("/", "layout");
    return { ok: true, message: "Allocation fully reconciled." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setAllocationStatusAction(_: Prev, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor("allocations.create");
    const status = str(fd, "status") as "ARCHIVED" | "VOIDED" | "ACTIVE";
    await setAllocationStatus(actor, str(fd, "allocationId"), status, str(fd, "reason"));
    revalidatePath("/", "layout");
    return { ok: true, message: status === "VOIDED" ? "Allocation voided." : status === "ARCHIVED" ? "Allocation archived." : "Allocation restored." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function settlePersonalSpendAction(_: Prev, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor("allocations.reconcile");
    const method = str(fd, "method") === "OFFSET" ? "OFFSET" : "REFUND";
    const r = await settlePersonalSpend(actor, str(fd, "allocationId"), {
      method,
      amount: money(fd, "amount")!,
      sourceAllocationId: opt(fd, "sourceAllocationId"),
      reference: opt(fd, "reference"),
      note: opt(fd, "note"),
    });
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: `${method === "OFFSET" ? "Settled from allocated funds" : "Refund recorded"}.${r.remaining > 0 ? ` ${formatMoney(r.remaining)} still owed.` : " Fully settled — you can now reconcile this record."}`,
    };
  } catch (e) {
    return toActionError(e);
  }
}
