import type { ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import { Logo } from "./logo";

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <div className="relative hidden w-[44%] flex-col justify-between overflow-hidden bg-brand-900 p-12 text-white lg:flex">
        <Logo light />
        <div className="relative z-10 max-w-md">
          <p className="text-3xl font-semibold leading-tight">Every naira received should have a traceable destination.</p>
          <ul className="mt-8 space-y-3 text-sm text-brand-100">
            {[
              "See exactly what each fund was for and how it was spent",
              "Receipts attached to every expense — no more WhatsApp threads",
              "Balances calculated automatically, reconciled in one click",
              "Audit-ready reports, exported to Excel, CSV or PDF",
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-brand-300" /> {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-brand-300">Funds received → Expenses logged → Evidence attached → Reviewed → Reconciled</p>
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-800/60" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-brand-800/40" />
      </div>
      <div className="flex flex-1 flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-gray-500">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
