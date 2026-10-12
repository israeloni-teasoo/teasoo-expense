"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth/current";
import { type ActionResult, toActionError } from "@/lib/errors";
import { createOrganisation, updateOrganisation } from "@/lib/services/organisations";
import { bool, opt, str } from "./_helpers";

type Prev = ActionResult<unknown> | null;

function fileFrom(fd: FormData, name: string): File | null {
  const v = fd.get(name);
  return v && typeof v === "object" && "arrayBuffer" in v && (v as File).size > 0 ? (v as File) : null;
}

export async function saveOrganisationAction(_: Prev, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const id = opt(fd, "id");
    if (id) {
      await updateOrganisation(actor, id, {
        name: str(fd, "name"),
        currency: opt(fd, "currency") ?? undefined,
        logo: fileFrom(fd, "logo"),
        removeLogo: bool(fd, "removeLogo"),
        archived: fd.has("archivedShown") ? bool(fd, "archived") : undefined,
      });
    } else {
      await createOrganisation(actor, { name: str(fd, "name"), currency: opt(fd, "currency") ?? undefined, logo: fileFrom(fd, "logo") });
    }
    revalidatePath("/", "layout");
    return { ok: true, message: id ? "Organisation saved." : "Organisation created. You're its administrator — switch to it to invite people." };
  } catch (e) {
    return toActionError(e);
  }
}
