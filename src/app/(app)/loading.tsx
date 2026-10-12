/** Shown instantly while the next screen's data loads, so navigation never feels unresponsive. */
export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="mb-6 space-y-2">
        <div className="h-7 w-48 rounded-lg bg-gray-200" />
        <div className="h-4 w-72 max-w-full rounded bg-gray-200/70" />
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 rounded-xl border border-gray-200 bg-white p-4">
            <div className="h-3 w-20 rounded bg-gray-200" />
            <div className="mt-3 h-6 w-28 rounded bg-gray-200" />
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-xl border border-gray-200 bg-white">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-gray-100 px-5 py-4 last:border-0">
            <div className="h-4 flex-1 rounded bg-gray-200" />
            <div className="h-4 w-20 rounded bg-gray-200" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
