"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth/current";
import { type ActionResult, toActionError } from "@/lib/errors";
import { createUser, saveCategory, saveDepartment, saveProject, saveSettings, updateUser } from "@/lib/services/admin";
import type { Role } from "@/db/schema";
import { bool, money, opt, str } from "./_helpers";

type Prev = ActionResult<unknown> | null;

export async function saveUserAction(_: Prev, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor("admin.users");
    const id = opt(fd, "userId");
    const input = {
      firstName: str(fd, "firstName"),
      lastName: str(fd, "lastName"),
      email: str(fd, "email"),
      phone: opt(fd, "phone"),
      jobTitle: opt(fd, "jobTitle"),
      role: str(fd, "role") as Role,
      departmentId: opt(fd, "departmentId"),
      password: opt(fd, "password"),
      status: (str(fd, "status") || "ACTIVE") as "ACTIVE" | "SUSPENDED",
    };
    if (id) await updateUser(actor, id, input);
    else await createUser(actor, input);
    revalidatePath("/admin/users");
    return { ok: true, message: id ? "User updated." : "User created. Share their sign-in details securely." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveCategoryAction(_: Prev, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor("admin.config");
    await saveCategory(actor, opt(fd, "id"), {
      name: str(fd, "name"),
      description: opt(fd, "description"),
      keywords: opt(fd, "keywords"),
      receiptRequired: bool(fd, "receiptRequired"),
      archived: bool(fd, "archived"),
    });
    revalidatePath("/admin/categories");
    return { ok: true, message: "Category saved." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveDepartmentAction(_: Prev, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor("admin.config");
    await saveDepartment(actor, opt(fd, "id"), { name: str(fd, "name"), code: opt(fd, "code"), archived: bool(fd, "archived") });
    revalidatePath("/admin/departments");
    return { ok: true, message: "Department saved." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveProjectAction(_: Prev, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor("admin.config");
    await saveProject(actor, opt(fd, "id"), {
      name: str(fd, "name"),
      code: opt(fd, "code"),
      description: opt(fd, "description"),
      budget: money(fd, "budget", { required: false }),
      departmentId: opt(fd, "departmentId"),
      startDate: opt(fd, "startDate"),
      endDate: opt(fd, "endDate"),
      archived: bool(fd, "archived"),
    });
    revalidatePath("/admin/projects");
    return { ok: true, message: "Project saved." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveSettingsAction(_: Prev, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor("admin.config");
    await saveSettings(actor, {
      name: str(fd, "name"),
      settings: {
        blockOverspend: bool(fd, "blockOverspend"),
        duplicateDetection: bool(fd, "duplicateDetection"),
        blockFutureDates: bool(fd, "blockFutureDates"),
        requireReceipt: bool(fd, "requireReceipt"),
        maxUploadMb: Number(str(fd, "maxUploadMb")),
        nearDepletionPercent: Number(str(fd, "nearDepletionPercent")),
        unusualMultiplier: Number(str(fd, "unusualMultiplier")),
      },
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Settings saved." };
  } catch (e) {
    return toActionError(e);
  }
}
