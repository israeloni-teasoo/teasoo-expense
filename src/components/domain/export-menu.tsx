import { Download, FileSpreadsheet, FileText, Sheet } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";

/** Export menu: each option lists its formats (Excel / CSV / PDF). Works without JavaScript. */
export function ExportMenu({ options, label = "Export" }: { options: { label: string; description?: string; query: string }[]; label?: string }) {
  return (
    <details className="relative">
      <summary className={buttonClasses("secondary", "md", "list-none cursor-pointer [&::-webkit-details-marker]:hidden")}>
        <Download className="h-4 w-4" /> {label}
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
        {options.map((o) => (
          <div key={o.label} className="rounded-lg px-3 py-2.5 hover:bg-gray-50">
            <p className="text-sm font-medium text-gray-900">{o.label}</p>
            {o.description && <p className="text-xs text-gray-500">{o.description}</p>}
            <div className="mt-2 flex gap-2">
              <a href={`/api/exports?${o.query}&format=xlsx`} className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100">
                <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
              </a>
              <a href={`/api/exports?${o.query}&format=csv`} className="inline-flex items-center gap-1 rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700 ring-1 ring-gray-200 hover:bg-gray-100">
                <Sheet className="h-3.5 w-3.5" /> CSV
              </a>
              <a href={`/api/exports?${o.query}&format=pdf`} className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-800 ring-1 ring-red-200 hover:bg-red-100">
                <FileText className="h-3.5 w-3.5" /> PDF
              </a>
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}
