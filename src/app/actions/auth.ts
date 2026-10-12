"use server";

import { redirect } from "next/navigation";
import { type ActionResult, toActionError } from "@/lib/errors";
import { login, logout, requestPasswordReset, resetPassword } from "@/lib/services/auth";

export async function loginAction(_: ActionResult<unknown> | null, fd: FormData): Promise<ActionResult> {
  try {
    await login(String(fd.get("email") ?? ""), String(fd.get("password") ?? ""));
  } catch (e) {
    return toActionError(e);
  }
  const next = String(fd.get("next") ?? "");
  return { ok: true, redirectTo: next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard" };
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}

export async function forgotPasswordAction(_: ActionResult<unknown> | null, fd: FormData): Promise<ActionResult> {
  try {
    await requestPasswordReset(String(fd.get("email") ?? ""));
    return { ok: true, message: "If that email belongs to an account, a reset link has been sent." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function resetPasswordAction(_: ActionResult<unknown> | null, fd: FormData): Promise<ActionResult> {
  try {
    if (fd.get("password") !== fd.get("confirm"))
      return { ok: false, error: "Passwords do not match.", fieldErrors: { confirm: "Passwords do not match." } };
    await resetPassword(String(fd.get("token") ?? ""), String(fd.get("password") ?? ""));
    return { ok: true, message: "Password updated. Sign in with your new password.", redirectTo: "/login" };
  } catch (e) {
    return toActionError(e);
  }
}
