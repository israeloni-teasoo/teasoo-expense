"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth/current";
import { type ActionResult, toActionError } from "@/lib/errors";
import { createUser, resendInvite, resendLoginDetails, saveCategory, saveDepartment, saveProject, saveSettings, updateUser } from "@/lib/services/admin";
import type { Role } from "@/db/schema";
import { bool, money, opt, str } from "./_helpers";

type Prev = ActionResult<unknown> | null;

export type IssuedCredentials = {
  email: string;
  password: string | null;
  emailed: boolean | null;
  google: boolean;
  /** An existing user was given access to more organisations. */
  existing?: boolean;
  organisations?: string[];
};

export async function saveUserAction(_: Prev, fd: FormData): Promise<ActionResult<IssuedCredentials>> {
  try {
    const id = opt(fd, "userId");
    const actor = await requireActor(id ? "admin.users" : undefined);
    const input = {
      firstName: str(fd, "firstName"),
      lastName: str(fd, "lastName"),
      email: str(fd, "email"),
      phone: opt(fd, "phone"),
      jobTitle: opt(fd, "jobTitle"),
      role: (str(fd, "role") || "STAFF") as Role,
      departmentId: opt(fd, "departmentId"),
      password: opt(fd, "password"),
      status: (str(fd, "status") || "ACTIVE") as "ACTIVE" | "SUSPENDED",
      sendCredentials: bool(fd, "sendCredentials"),
      organisationIds: fd.has("orgsShown") ? fd.getAll("organisationIds").map(String).filter(Boolean) : undefined,
      isGroupAdmin: fd.has("groupAdminShown") ? bool(fd, "isGroupAdmin") : undefined,
    };
    if (id) {
      await updateUser(actor, id, input);
      revalidatePath("/admin/users");
      return { ok: true, message: "User updated." };
    }
    const r = await createUser(actor, input);
    revalidatePath("/admin/users");
    revalidatePath("/staff");
    return {
      ok: true,
      message: r.existing
        ? `${r.user.email} now has access to ${r.organisations.join(", ")}.`
        : r.emailed
          ? `Invitation emailed to ${r.user.email}.`
          : "User invited.",
      data: { email: r.user.email, password: r.password, emailed: r.emailed, google: r.google, existing: r.existing, organisations: r.organisations },
    };
  } catch (e) {
    return toActionError(e);
  }
}

export async function resendLoginAction(_: Prev, fd: FormData): Promise<ActionResult<IssuedCredentials>> {
  try {
    const actor = await requireActor();
    const r = await resendLoginDetails(actor, str(fd, "userId"), { email: bool(fd, "sendCredentials") });
    return {
      ok: true,
      message: r.emailed ? "New login details emailed." : "New password issued.",
      data: { email: str(fd, "email"), password: r.password, emailed: r.emailed, google: false },
    };
  } catch (e) {
    return toActionError(e);
  }
}

export async function resendInviteAction(_: Prev, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    await resendInvite(actor, str(fd, "userId"));
    return { ok: true, message: "Invitation sent again." };
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
      isOther: bool(fd, "isOther"),
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

export async function testStorageAction(): Promise<ActionResult> {
  try {
    await requireActor("admin.config");
    const { testStorage } = await import("@/lib/storage");
    const r = await testStorage();
    return r.ok ? { ok: true, message: r.message } : { ok: false, error: r.message };
  } catch (e) {
    return toActionError(e);
  }
}

export async function testEmailAction(): Promise<ActionResult> {
  try {
    const actor = await requireActor("admin.config");
    const { sendEmail, notificationEmail } = await import("@/lib/email");
    const r = await sendEmail({ to: actor.email, ...notificationEmail({ title: "Test email from Teasoo Funds & Expenses", body: "If you can read this, email notifications are working.", link: "/admin/settings" }) });
    return r.ok ? { ok: true, message: `Test email sent to ${actor.email}.` } : { ok: false, error: r.error ?? "Email failed." };
  } catch (e) {
    return toActionError(e);
  }
}
