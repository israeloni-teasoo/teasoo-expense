"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth/current";
import { type ActionResult, toActionError } from "@/lib/errors";
import { createClaim, decideClaim } from "@/lib/services/claims";
import { filesFrom } from "@/lib/storage";
import type { ClaimType } from "@/db/schema";
import { money, opt, str } from "./_helpers";

type Prev = ActionResult<unknown> | null;

export async function createClaimAction(_: Prev, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor("funds.own");
    await createClaim(
      actor,
      {
        allocationId: str(fd, "allocationId"),
        type: (str(fd, "type") || "REIMBURSEMENT") as ClaimType,
        amount: money(fd, "amount")!,
        reason: str(fd, "reason"),
        authorizedBy: opt(fd, "authorizedBy"),
      },
      filesFrom(fd, "evidence"),
    );
    revalidatePath("/", "layout");
    return { ok: true, message: "Claim submitted. Finance has been notified." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function decideClaimAction(_: Prev, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const decision = str(fd, "decision") as "RECOMMEND" | "APPROVE" | "REJECT" | "CANCEL";
    await decideClaim(actor, str(fd, "claimId"), decision, opt(fd, "comment"));
    revalidatePath("/", "layout");
    const msg = { RECOMMEND: "Claim recommended for approval.", APPROVE: "Claim approved and funds added to the allocation.", REJECT: "Claim rejected.", CANCEL: "Claim cancelled." };
    return { ok: true, message: msg[decision] };
  } catch (e) {
    return toActionError(e);
  }
}
