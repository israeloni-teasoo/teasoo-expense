"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth/current";
import { type ActionResult, DomainError, toActionError } from "@/lib/errors";
import { parseMoney } from "@/lib/money";
import { parseQuantity } from "@/lib/requisition-rules";
import { filesFrom } from "@/lib/storage";
import {
  cancelRequisition,
  commentOnRequisition,
  decideRequisition,
  processRequisition,
  recallRequisition,
  saveRequisition,
  saveRequisitionApprovers,
  saveVendor,
  type RequisitionItemInput,
} from "@/lib/services/requisitions";
import { bool, opt, str } from "./_helpers";

type Prev = ActionResult<unknown> | null;

type RawItem = { itemName?: string; categoryId?: string; categoryOther?: string; description?: string; vendorId?: string; quantity?: string; rate?: string; discount?: string };

function readItems(fd: FormData): RequisitionItemInput[] {
  let raw: RawItem[];
  try {
    raw = JSON.parse(str(fd, "items") || "[]");
  } catch {
    throw new DomainError("The items couldn't be read. Refresh the page and try again.");
  }
  if (!Array.isArray(raw)) raw = [];
  return raw.slice(0, 100).map((i) => ({
    itemName: String(i.itemName ?? ""),
    categoryId: String(i.categoryId ?? ""),
    categoryOther: i.categoryOther ? String(i.categoryOther) : null,
    description: i.description ? String(i.description) : null,
    vendorId: i.vendorId ? String(i.vendorId) : null,
    quantity: parseQuantity(i.quantity ?? ""),
    rate: parseMoney(i.rate ?? ""),
    discount: parseMoney(i.discount ?? "") ?? 0,
  }));
}

export async function saveRequisitionAction(_: Prev, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor("requisitions.create");
    const submit = str(fd, "intent") === "submit";
    const row = await saveRequisition(
      actor,
      opt(fd, "id"),
      {
        title: str(fd, "title"),
        expectedDate: str(fd, "expectedDate"),
        deliveryAddress: opt(fd, "deliveryAddress"),
        externalReference: opt(fd, "externalReference"),
        notesToApprover: opt(fd, "notesToApprover"),
        projectId: opt(fd, "projectId"),
        items: readItems(fd),
      },
      filesFrom(fd, "quotes"),
      { submit, comment: opt(fd, "comment") },
    );
    revalidatePath("/", "layout");
    return { ok: true, message: submit ? `${row.reference} submitted for approval.` : `${row.reference} saved as a draft.`, redirectTo: `/requisitions/${row.id}` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function requisitionStepAction(_: Prev, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const id = str(fd, "id");
    const step = str(fd, "step");
    let message = "Saved.";
    if (step === "recall") {
      await recallRequisition(actor, id);
      message = "Recalled — you can edit it and submit again.";
    } else if (step === "cancel") {
      await cancelRequisition(actor, id, opt(fd, "comment"));
      message = "Requisition cancelled.";
    } else if (step === "APPROVE" || step === "REJECT" || step === "HOLD") {
      await decideRequisition(actor, id, step, opt(fd, "comment"));
      message = step === "APPROVE" ? "Approved — sent on for payment." : step === "REJECT" ? "Declined — the requester has been told why." : "Sent back asking for more information.";
    } else if (step === "comment") {
      await commentOnRequisition(actor, id, str(fd, "comment"), filesFrom(fd, "files"));
      message = "Comment added.";
    } else {
      throw new DomainError("Unknown action.");
    }
    revalidatePath("/", "layout");
    return { ok: true, message };
  } catch (e) {
    return toActionError(e);
  }
}

export async function processRequisitionAction(_: Prev, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const id = str(fd, "id");
    const payTo = str(fd, "payTo") === "REQUESTER" ? "REQUESTER" : "VENDOR";
    const { allocationId } = await processRequisition(
      actor,
      id,
      { paymentDate: str(fd, "paymentDate"), paymentMethod: opt(fd, "paymentMethod"), paymentReference: opt(fd, "paymentReference"), notes: opt(fd, "notes"), payTo },
      filesFrom(fd, "proof"),
    );
    revalidatePath("/", "layout");
    return { ok: true, message: allocationId ? "Payment recorded and an allocation created for the requester." : "Payment recorded." };
  } catch (e) {
    return toActionError(e);
  }
}

export type SavedVendor = { id: string; name: string; accountName: string | null; accountNumber: string | null; bankName: string | null };

export async function saveVendorAction(_: Prev, fd: FormData): Promise<ActionResult<SavedVendor>> {
  try {
    const actor = await requireActor();
    const v = await saveVendor(actor, opt(fd, "id"), {
      name: str(fd, "name"),
      accountName: opt(fd, "accountName"),
      accountNumber: opt(fd, "accountNumber"),
      bankName: opt(fd, "bankName"),
      email: opt(fd, "email"),
      phone: opt(fd, "phone"),
      notes: opt(fd, "notes"),
      archived: bool(fd, "archived"),
    });
    revalidatePath("/admin/vendors");
    return { ok: true, message: `Vendor ${v.name} saved.`, data: { id: v.id, name: v.name, accountName: v.accountName, accountNumber: v.accountNumber, bankName: v.bankName } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveRequisitionApproversAction(_: Prev, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor("admin.config");
    await saveRequisitionApprovers(actor, {
      approverId: opt(fd, "approverId"),
      approverBackupId: opt(fd, "approverBackupId"),
      executorId: opt(fd, "executorId"),
      executorBackupId: opt(fd, "executorBackupId"),
      prefix: opt(fd, "prefix"),
      nextNumber: opt(fd, "nextNumber") ? Number(str(fd, "nextNumber")) : null,
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Requisition settings saved." };
  } catch (e) {
    return toActionError(e);
  }
}
