"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, formatMoneyCompact } from "@/lib/money";

const BAR = "#276c6a"; // brand-600 — single-series magnitude uses one hue
const GRID = "#eef0f2";
const INK_MUTED = "#6b7280";

type Row = { name: string; total: number; count?: number };

function TooltipBox({ active, payload, label }: { active?: boolean; payload?: { payload: Row & { label?: string } }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-gray-900">{p.label ?? p.name ?? label}</p>
      <p className="mt-0.5 tabular-nums text-gray-700">{formatMoney(p.total)}</p>
      {p.count != null && <p className="text-gray-500">{p.count} expense{p.count === 1 ? "" : "s"}</p>}
    </div>
  );
}

/** Ranked magnitudes (spend by category / staff / project): horizontal bars, sorted. */
export function RankedBars({ data, max = 8 }: { data: Row[]; max?: number }) {
  const rows = data.slice(0, max);
  if (!rows.length) return <p className="py-10 text-center text-sm text-gray-500">No spending recorded yet.</p>;
  const height = rows.length * 34 + 24;
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }} barCategoryGap={8}>
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis type="number" hide domain={[0, "dataMax"]} />
          <YAxis
            type="category"
            dataKey="name"
            width={110}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: "#374151" }}
            tickFormatter={(v: string) => (v.length > 16 ? v.slice(0, 15) + "…" : v)}
          />
          <Tooltip content={<TooltipBox />} cursor={{ fill: "#f3f4f6" }} />
          <Bar
            dataKey="total"
            fill={BAR}
            radius={[0, 4, 4, 0]}
            maxBarSize={22}
            label={{ position: "right", fontSize: 11, fill: INK_MUTED, formatter: (v: unknown) => formatMoneyCompact(Number(v)) }}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Spending over time: weekly totals as columns. */
export function WeeklyBars({ data }: { data: { week: string; total: number }[] }) {
  const rows = data.map((d) => ({
    ...d,
    name: new Date(d.week + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    label: `Week of ${new Date(d.week + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`,
  }));
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: INK_MUTED }} interval="preserveStartEnd" />
          <YAxis tickLine={false} axisLine={false} width={48} tick={{ fontSize: 11, fill: INK_MUTED }} tickFormatter={(v: number) => formatMoneyCompact(v)} />
          <Tooltip content={<TooltipBox />} cursor={{ fill: "#f3f4f6" }} />
          <Bar dataKey="total" fill={BAR} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
