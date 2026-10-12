import { describe, expect, it } from "vitest";
import { parseDate, parseReceiptText } from "./receipt-parser";

const N = (n: number) => Math.round(n * 100);

describe("parseReceiptText", () => {
  it("reads the spec's example receipt", () => {
    const text = `ABC OFFICE SUPPLIES LTD
12 Allen Avenue, Ikeja
Tel: 0803 123 4567
Receipt No: INV-29871
Date: 08/10/2026  10:31
A4 Paper x5          17,500.00
Toner cartridge      28,000.00
Subtotal             45,500.00
VAT 7.5%              3,412.50
TOTAL              ₦45,500.00
Thank you for your business`;
    expect(parseReceiptText(text, "2026-10-12")).toEqual({
      amount: N(45_500),
      date: "2026-10-08",
      vendor: "Abc Office Supplies Ltd",
      receiptNumber: "INV-29871",
      tax: N(3_412.5),
    });
  });

  it("prefers grand total over subtotal and handles OCR'd naira signs", () => {
    const text = `Chicken Republic
Sub Total N 60,000.00
Service charge 3,000.00
Grand Total N63,000.00
Cash paid 65,000.00`;
    const r = parseReceiptText(text, "2026-10-12");
    expect(r.amount).toBe(N(63_000));
    expect(r.vendor).toBe("Chicken Republic");
  });

  it("finds a total printed on the following line", () => {
    const r = parseReceiptText("Spectranet\nAMOUNT DUE\n50,000.00", "2026-10-12");
    expect(r.amount).toBe(N(50_000));
  });

  it("falls back to the largest formatted figure", () => {
    const r = parseReceiptText("Copy Express\nPrinting 12,500.00\nBinding 2,000.00\nphone 08031234567", "2026-10-12");
    expect(r.amount).toBe(N(12_500));
  });

  it("returns nulls when nothing is recognisable", () => {
    expect(parseReceiptText("", "2026-10-12")).toEqual({ amount: null, date: null, vendor: null, receiptNumber: null, tax: null });
  });
});

describe("parseDate", () => {
  it("reads day-first and named-month dates", () => {
    expect(parseDate("Date 08/10/2026", "2026-12-31")).toBe("2026-10-08");
    expect(parseDate("08-10-26 14:02", "2026-12-31")).toBe("2026-10-08");
    expect(parseDate("8th Oct, 2026", "2026-12-31")).toBe("2026-10-08");
    expect(parseDate("October 8, 2026", "2026-12-31")).toBe("2026-10-08");
    expect(parseDate("2026-10-08T10:00", "2026-12-31")).toBe("2026-10-08");
  });
  it("ignores future and impossible dates", () => {
    expect(parseDate("Valid till 31/12/2027", "2026-10-12")).toBeNull();
    expect(parseDate("31/02/2026", "2026-10-12")).toBeNull();
  });
});
