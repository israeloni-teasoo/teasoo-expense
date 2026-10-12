"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth/current";
import { type ActionResult, toActionError } from "@/lib/errors";
import { createFeedback, respondToFeedback } from "@/lib/services/feedback";
import { filesFrom } from "@/lib/storage";
import type { FeedbackCategory, FeedbackStatus } from "@/db/schema";
import { opt, str } from "./_helpers";

type Prev = ActionResult<unknown> | null;

export async function sendFeedbackAction(_: Prev, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    await createFeedback(
      actor,
      {
        category: (str(fd, "category") || "OTHER") as FeedbackCategory,
        subject: str(fd, "subject"),
        message: str(fd, "message"),
        pageUrl: opt(fd, "pageUrl"),
        userAgent: opt(fd, "userAgent"),
      },
      filesFrom(fd, "screenshots"),
    );
    revalidatePath("/feedback");
    revalidatePath("/admin/feedback");
    return { ok: true, message: "Thanks — your feedback has been sent to the administrators." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function respondFeedbackAction(_: Prev, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor("feedback.manage");
    await respondToFeedback(actor, str(fd, "feedbackId"), { status: str(fd, "status") as FeedbackStatus, response: opt(fd, "response") });
    revalidatePath("/admin/feedback");
    revalidatePath("/", "layout");
    return { ok: true, message: "Feedback updated — the sender has been notified." };
  } catch (e) {
    return toActionError(e);
  }
}
