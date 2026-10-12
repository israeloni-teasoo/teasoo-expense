import { Download, Eye, FileText } from "lucide-react";
import { formatDateTime } from "@/lib/dates";
import { DOCUMENT_KIND_LABELS, formatBytes } from "@/lib/format";
import type { DocumentKind } from "@/db/schema";
import { RemoveDocumentButton } from "./document-actions";

export type DocItem = {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  kind: DocumentKind;
  uploadedAt: Date;
  uploaderName?: string;
  caption?: string;
};

/** Receipts are served through an authenticated route — never a public URL. */
export function DocumentGrid({ docs, canRemove }: { docs: DocItem[]; canRemove?: (d: DocItem) => boolean }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {docs.map((d) => {
        const isImage = d.fileType.startsWith("image/");
        return (
          <li key={d.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <a href={`/api/documents/${d.id}`} target="_blank" rel="noopener" className="block bg-gray-50">
              {isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/documents/${d.id}`} alt={d.fileName} className="h-40 w-full object-cover" loading="lazy" />
              ) : (
                <div className="flex h-40 flex-col items-center justify-center gap-2 text-gray-400">
                  <FileText className="h-10 w-10" />
                  <span className="text-xs font-medium uppercase">PDF</span>
                </div>
              )}
            </a>
            <div className="p-3">
              <p className="truncate text-sm font-medium text-gray-900" title={d.fileName}>
                {d.fileName}
              </p>
              <p className="mt-0.5 truncate text-xs text-gray-500">
                {DOCUMENT_KIND_LABELS[d.kind]} · {formatBytes(d.fileSize)} · {formatDateTime(d.uploadedAt)}
                {d.uploaderName ? ` · ${d.uploaderName}` : ""}
              </p>
              {d.caption && <p className="mt-0.5 truncate text-xs text-gray-500">{d.caption}</p>}
              <div className="mt-2 flex flex-wrap gap-1">
                <a href={`/api/documents/${d.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100">
                  <Eye className="h-3.5 w-3.5" /> Preview
                </a>
                <a href={`/api/documents/${d.id}?download=1`} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100">
                  <Download className="h-3.5 w-3.5" /> Download
                </a>
                {canRemove?.(d) && <RemoveDocumentButton id={d.id} name={d.fileName} />}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
