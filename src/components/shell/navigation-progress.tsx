"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const START_EVENT = "tx:navigation-start";

/** Call before a programmatic navigation (router.push) so the progress bar shows. */
export function startNavigationProgress() {
  window.dispatchEvent(new Event(START_EVENT));
}

/**
 * Slim progress bar at the top of the screen while the next page loads. Starts on clicks on
 * internal links and GET form submissions (and programmatic navigations that call
 * startNavigationProgress), finishes when the URL changes.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const safety = useRef<ReturnType<typeof setTimeout> | null>(null);

  // URL changed → the new page is in; finish the bar.
  useEffect(() => {
    setState((s) => (s === "loading" ? "done" : s));
  }, [pathname, searchParams]);

  useEffect(() => {
    if (state !== "done") return;
    const t = setTimeout(() => setState("idle"), 300);
    return () => clearTimeout(t);
  }, [state]);

  useEffect(() => {
    const start = () => {
      setState("loading");
      if (safety.current) clearTimeout(safety.current);
      // Never leave the bar stuck (e.g. a download link or a cancelled navigation).
      safety.current = setTimeout(() => setState((s) => (s === "loading" ? "done" : s)), 15000);
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      start();
    };
    // Capture phase: runs before next/form intercepts the submit for client-side navigation.
    const onSubmit = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement;
      if (form.method?.toLowerCase() === "get") start();
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    window.addEventListener(START_EVENT, start);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      window.removeEventListener(START_EVENT, start);
    };
  }, []);

  if (state === "idle") return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-[3px]" role="progressbar" aria-label="Loading page" aria-busy={state === "loading"}>
      <div
        className={
          state === "loading"
            ? "h-full w-[85%] origin-left animate-[tx-progress_8s_cubic-bezier(0.1,0.7,0.2,1)_forwards] bg-brand-500 shadow-[0_0_8px] shadow-brand-400"
            : "h-full w-full bg-brand-500 opacity-0 transition-opacity duration-300"
        }
      />
    </div>
  );
}
