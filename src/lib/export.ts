import "server-only";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type ColumnType = "text" | "money" | "number" | "date" | "percent";
export type Column<T> = { header: string; key: string; type?: ColumnType; width?: number; value: (row: T) => string | number | null | undefined };

export type Table<T> = {
  title: string;
  subtitle?: string;
  columns: Column<T>[];
  rows: T[];
  /** Optional totals row; keys map to column keys. */
  totals?: Record<string, string | number>;
};

const isMoney = (c: { type?: ColumnType }) => c.type === "money";

/** Money columns carry kobo values; exports present naira with two decimals. */
function cell<T>(c: Column<T>, row: T) {
  const v = c.value(row);
  if (v == null) return "";
  if (isMoney(c) && typeof v === "number") return v / 100;
  return v;
}

function csvEscape(v: unknown) {
  let s = v == null ? "" : String(v);
  // Prevent spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV<T>(table: Table<T>): Buffer {
  const lines = [table.columns.map((c) => csvEscape(isMoney(c) ? `${c.header} (NGN)` : c.header)).join(",")];
  for (const row of table.rows) {
    lines.push(
      table.columns
        .map((c) => {
          const v = cell(c, row);
          return csvEscape(typeof v === "number" && isMoney(c) ? v.toFixed(2) : v);
        })
        .join(","),
    );
  }
  if (table.totals) {
    lines.push(
      table.columns
        .map((c, i) => {
          const v = table.totals![c.key];
          if (v == null) return i === 0 ? "TOTAL" : "";
          return csvEscape(typeof v === "number" && isMoney(c) ? (v / 100).toFixed(2) : v);
        })
        .join(","),
    );
  }
  return Buffer.from("﻿" + lines.join("\r\n"), "utf8");
}

export async function toXLSX<T>(tables: Table<T>[], meta: { organisation: string; generatedBy: string }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = meta.generatedBy;
  wb.created = new Date();
  for (const table of tables) {
    const ws = wb.addWorksheet(table.title.slice(0, 31).replace(/[\\/?*[\]:]/g, " "), {
      views: [{ state: "frozen", ySplit: 4 }],
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    ws.addRow([`${meta.organisation} — ${table.title}`]).font = { bold: true, size: 14 };
    ws.addRow([table.subtitle ?? ""]).font = { color: { argb: "FF6B7280" } };
    ws.addRow([`Generated ${new Date().toLocaleString("en-GB", { timeZone: "Africa/Lagos" })} by ${meta.generatedBy}`]).font = { color: { argb: "FF6B7280" }, size: 9 };
    const header = ws.addRow(table.columns.map((c) => (isMoney(c) ? `${c.header} (₦)` : c.header)));
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.eachCell((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF225756" } };
      c.alignment = { vertical: "middle" };
    });
    for (const row of table.rows) ws.addRow(table.columns.map((c) => cell(c, row)));
    if (table.totals) {
      const t = ws.addRow(
        table.columns.map((c, i) => {
          const v = table.totals![c.key];
          if (v == null) return i === 0 ? "TOTAL" : "";
          return typeof v === "number" && isMoney(c) ? v / 100 : v;
        }),
      );
      t.font = { bold: true };
      t.eachCell((c) => (c.border = { top: { style: "thin" } }));
    }
    table.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      col.width = c.width ?? (isMoney(c) ? 16 : c.type === "date" ? 13 : 22);
      if (isMoney(c)) col.numFmt = "#,##0.00;[Red]-#,##0.00";
      if (c.type === "percent") col.numFmt = '0.0"%"';
    });
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: table.columns.length } };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** The built-in PDF fonts have no ₦ glyph, so PDFs use the NGN code. */
function pdfMoney(kobo: number) {
  const neg = kobo < 0;
  const abs = Math.abs(kobo);
  const s = `${Math.trunc(abs / 100).toLocaleString("en-NG")}.${String(abs % 100).padStart(2, "0")}`;
  return `${neg ? "-" : ""}${s}`;
}

export function toPDF<T>(tables: Table<T>[], meta: { organisation: string; generatedBy: string }): Buffer {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  tables.forEach((table, idx) => {
    if (idx > 0) doc.addPage();
    doc.setFont("helvetica", "bold").setFontSize(15).setTextColor(34, 87, 86).text(table.title, 40, 46);
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(100);
    doc.text(meta.organisation + (table.subtitle ? `  ·  ${table.subtitle}` : ""), 40, 62);
    doc.text(`Generated ${new Date().toLocaleString("en-GB", { timeZone: "Africa/Lagos" })} by ${meta.generatedBy}  ·  Amounts in NGN`, 40, 74);
    const body = table.rows.map((row) =>
      table.columns.map((c) => {
        const v = c.value(row);
        if (v == null) return "";
        if (isMoney(c) && typeof v === "number") return pdfMoney(v);
        if (c.type === "percent" && typeof v === "number") return `${v}%`;
        return String(v);
      }),
    );
    const foot = table.totals
      ? [
          table.columns.map((c, i) => {
            const v = table.totals![c.key];
            if (v == null) return i === 0 ? "TOTAL" : "";
            return typeof v === "number" && isMoney(c) ? pdfMoney(v) : String(v);
          }),
        ]
      : undefined;
    autoTable(doc, {
      startY: 86,
      head: [table.columns.map((c) => c.header)],
      body,
      foot,
      theme: "striped",
      styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
      headStyles: { fillColor: [34, 87, 86], textColor: 255 },
      footStyles: { fillColor: [229, 231, 235], textColor: 20, fontStyle: "bold" },
      columnStyles: Object.fromEntries(
        table.columns.map((c, i) => [i, isMoney(c) || c.type === "number" || c.type === "percent" ? { halign: "right" as const } : {}]),
      ),
      margin: { left: 40, right: 40 },
      didDrawPage: () => {
        const page = doc.getNumberOfPages();
        doc.setFontSize(8).setTextColor(150).text(`Page ${page}`, pageWidth - 70, doc.internal.pageSize.getHeight() - 20);
      },
    });
  });
  return Buffer.from(doc.output("arraybuffer"));
}
