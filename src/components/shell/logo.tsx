export function Logo({ light }: { light?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <svg viewBox="0 0 64 64" className="h-8 w-8" aria-hidden>
        <rect width="64" height="64" rx="14" fill={light ? "#ffffff" : "#225756"} />
        <path d="M18 22h28M32 22v24" stroke={light ? "#225756" : "#fff"} strokeWidth="7" strokeLinecap="round" />
        <circle cx="46" cy="44" r="5" fill="#7bbfba" />
      </svg>
      <span className={light ? "text-white" : "text-gray-900"}>
        <span className="block text-sm font-semibold leading-4">Teasoo</span>
        <span className={`block text-[11px] leading-4 ${light ? "text-brand-200" : "text-gray-500"}`}>Funds & Expenses</span>
      </span>
    </span>
  );
}
