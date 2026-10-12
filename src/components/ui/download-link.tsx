"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./spinner";
import { useToast } from "./toast";

function filenameFrom(header: string | null, fallback: string) {
  const star = header?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (star) return decodeURIComponent(star);
  return header?.match(/filename="?([^";]+)"?/i)?.[1] ?? fallback;
}

/**
 * A download that shows progress: exports are generated on the server and can take a few
 * seconds, so the link spins until the file arrives (and reports failures) instead of
 * appearing to do nothing.
 */
export function DownloadLink({ href, className, children, fallbackName = "export" }: { href: string; className?: string; children: ReactNode; fallbackName?: string }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <a
      href={href}
      aria-busy={busy || undefined}
      className={cn(className, busy && "pointer-events-none cursor-wait opacity-80 [&>svg:not(.animate-spin)]:hidden")}
      onClick={async (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return; // let the browser handle "open in new tab"
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        try {
          const res = await fetch(href, { credentials: "same-origin" });
          if (!res.ok) {
            const body = await res.json().catch(() => null);
            throw new Error(body?.error ?? `Download failed (${res.status})`);
          }
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filenameFrom(res.headers.get("content-disposition"), fallbackName);
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 10_000);
        } catch (err) {
          toast(err instanceof Error ? err.message : "Download failed", "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy && <Spinner className="h-3.5 w-3.5" />}
      {children}
    </a>
  );
}
