function normalise(s: string | null | undefined) {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

/** Keyword-based category suggestion ("Paid for office internet renewal" → Internet). */
export function suggestCategory(description: string, categories: { id: string; name: string; keywords: string | null }[]): string | null {
  const text = ` ${normalise(description)} `;
  let best: { id: string; score: number } | null = null;
  for (const c of categories) {
    const words = [c.name, ...(c.keywords ?? "").split(",")].map((w) => normalise(w)).filter(Boolean);
    let score = 0;
    for (const w of words) if (text.includes(` ${w} `) || text.includes(` ${w}s `)) score += w.split(" ").length;
    if (score > 0 && (!best || score > best.score)) best = { id: c.id, score };
  }
  return best?.id ?? null;
}
