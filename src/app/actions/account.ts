"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth/current";
import { type ActionResult, toActionError } from "@/lib/errors";
import { markRead } from "@/lib/services/notifications";
import { keepIssuedPassword, updateProfile } from "@/lib/services/admin";
import { bool, opt, str } from "./_helpers";

type Prev = ActionResult<unknown> | null;

export async function markReadAction(fd: FormData) {
  const actor = await requireActor();
  await markRead(actor, opt(fd, "id") ?? undefined);
  revalidatePath("/", "layout");
}

export async function updateProfileAction(_: Prev, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const newPassword = str(fd, "newPassword");
    if (newPassword && newPassword !== str(fd, "confirmPassword"))
      return { ok: false, error: "New passwords do not match.", fieldErrors: { confirmPassword: "Does not match." } };
    await updateProfile(actor, {
      phone: opt(fd, "phone"),
      emailNotifications: bool(fd, "emailNotifications"),
      currentPassword: str(fd, "currentPassword"),
      newPassword: newPassword || undefined,
    });
    revalidatePath("/profile");
    return { ok: true, message: newPassword ? "Profile and password updated." : "Profile updated." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function keepPasswordAction() {
  const actor = await requireActor();
  await keepIssuedPassword(actor);
  revalidatePath("/", "layout");
}
