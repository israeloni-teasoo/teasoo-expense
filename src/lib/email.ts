import "server-only";
import { config, emailEnabled, emailFromProblem } from "./config";

export type Email = { to: string; subject: string; html: string; text: string };

/**
 * Sends email through Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email).
 * Without RESEND_API_KEY the message is logged instead, so development works offline.
 */
export async function sendEmail(msg: Email): Promise<{ ok: boolean; error?: string }> {
  if (!emailEnabled()) {
    console.info(`[email:not-sent] to=${msg.to} subject="${msg.subject}"\n${msg.text}`);
    return { ok: false, error: "Email is not configured (RESEND_API_KEY is missing)." };
  }
  const fromProblem = emailFromProblem(config.email.from);
  if (fromProblem) {
    console.error(`[email] ${fromProblem}`);
    return { ok: false, error: fromProblem };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.email.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: config.email.from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[email] Resend ${res.status}: ${body}`);
      // Pass Resend's own explanation through (e.g. "The teasooconsulting.com domain is not verified").
      let detail = "";
      try {
        detail = String((JSON.parse(body) as { message?: string }).message ?? "");
      } catch {
        detail = body.slice(0, 200);
      }
      return { ok: false, error: `Email provider error (${res.status})${detail ? `: ${detail}` : "."}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("[email] send failed", e);
    return { ok: false, error: "Could not reach the email provider." };
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(title: string, bodyHtml: string, cta?: { label: string; url: string }) {
  return `<!doctype html><html><body style="margin:0;background:#f5f6f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb">
<tr><td style="background:#225756;color:#ffffff;padding:16px 24px;border-radius:12px 12px 0 0;font-weight:600">Teasoo · Funds &amp; Expenses</td></tr>
<tr><td style="padding:24px">
<h1 style="font-size:18px;margin:0 0 12px">${esc(title)}</h1>
<div style="font-size:14px;line-height:1.6;color:#374151">${bodyHtml}</div>
${cta ? `<p style="margin:24px 0 0"><a href="${esc(cta.url)}" style="background:#225756;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;display:inline-block">${esc(cta.label)}</a></p>` : ""}
</td></tr></table>
<p style="font-size:11px;color:#9ca3af;margin-top:16px">You can turn off notification emails from your profile.</p>
</td></tr></table></body></html>`;
}

export function notificationEmail(n: { title: string; body?: string | null; link?: string | null }): Omit<Email, "to"> {
  const url = n.link ? `${config.appUrl}${n.link}` : config.appUrl;
  return {
    subject: n.title,
    html: layout(n.title, n.body ? `<p style="margin:0">${esc(n.body)}</p>` : "", { label: "Open in Teasoo", url }),
    text: `${n.title}\n\n${n.body ?? ""}\n\n${url}`,
  };
}

export function credentialsEmail(p: { name: string; email: string; password: string; addedBy: string }): Omit<Email, "to"> {
  const loginUrl = `${config.appUrl}/login`;
  const html = `<p style="margin:0 0 12px">Hi ${esc(p.name)},</p>
<p style="margin:0 0 12px">${esc(p.addedBy)} has given you access to Teasoo Funds &amp; Expenses, where you log how funds you receive are spent and upload receipts.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="background:#f3f4f6;border-radius:8px;padding:12px 16px;margin:0 0 12px;font-size:14px">
<tr><td style="color:#6b7280;padding-right:12px">Email</td><td style="font-weight:600">${esc(p.email)}</td></tr>
<tr><td style="color:#6b7280;padding-right:12px">Password</td><td style="font-family:monospace;font-weight:600">${esc(p.password)}</td></tr>
</table>
<p style="margin:0">After signing in you can keep this password or change it to one of your own from your profile.</p>`;
  return {
    subject: "Your Teasoo Funds & Expenses login",
    html: layout("Your login details", html, { label: "Sign in", url: loginUrl }),
    text: `Hi ${p.name},\n\n${p.addedBy} has given you access to Teasoo Funds & Expenses.\n\nSign in at ${loginUrl}\nEmail: ${p.email}\nPassword: ${p.password}\n\nAfter signing in you can keep this password or change it from your profile.`,
  };
}

export function resetEmail(p: { name: string; url: string }): Omit<Email, "to"> {
  return {
    subject: "Reset your Teasoo password",
    html: layout("Reset your password", `<p style="margin:0">Hi ${esc(p.name)}, use the button below to choose a new password. The link expires in one hour. If you didn't ask for this, ignore this email.</p>`, { label: "Choose a new password", url: p.url }),
    text: `Hi ${p.name},\n\nChoose a new password: ${p.url}\n\nThe link expires in one hour. If you didn't ask for this, ignore this email.`,
  };
}
