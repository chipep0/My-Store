/** Local calendar date as "YYYY-MM-DD" — NOT date.toISOString().slice(0,10),
 * which converts to UTC first and silently shifts a day for any timezone
 * ahead of UTC (e.g. CAT), corrupting date-only DB columns and date-input
 * defaults during the first couple hours of each local day. */
export function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "YYYY-MM-DD" 30 days ago — the shared default for every From/To date filter. */
export function defaultFromDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return localDateStr(d);
}

/** "Tuesday, 5 August 2026" — used wherever a date should read out its weekday
 * (debts, receipts, reports) instead of the bare numeric date. */
export function fullDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/** fullDate() plus a time, e.g. "Tuesday, 5 August 2026, 14:32". */
export function fullDateTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function money(n: number, currency: string): string {
  const rounded = Math.round(n * 100) / 100;
  return currency + rounded.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function signedMoney(n: number, currency: string): string {
  return (n < 0 ? "-" : "") + money(Math.abs(n), currency);
}

export function unitPriceFor(p: { sales_price: number; purchase_price: number; box_sales_price: number | null; box_purchase_price: number | null }, unit: "EA" | "BOX", mode: "SALE" | "PURCHASE"): number {
  if (unit === "BOX") return mode === "SALE" ? Number(p.box_sales_price || 0) : Number(p.box_purchase_price || 0);
  return mode === "SALE" ? Number(p.sales_price || 0) : Number(p.purchase_price || 0);
}

export type StockClass = "in" | "low" | "out";

/** The in/low/out threshold rule, shared by every screen that shows a stock badge. */
export function stockClass(onHand: number | null | undefined, lowStock: number): StockClass {
  if (onHand == null) return "in";
  if (onHand <= 0) return "out";
  if (onHand <= lowStock) return "low";
  return "in";
}

export function stockBadgeVariant(cls: StockClass): string {
  return cls === "out" ? "b-Void" : cls === "low" ? "b-Open" : "b-Paid";
}

export function stockTag(cls: StockClass): string {
  return cls === "out" ? "OUT" : cls === "low" ? "LOW" : "OK";
}

export function qtyBoxLabel(unitsPerBox: number, totalEA: number): string {
  const upb = Math.max(1, Math.floor(unitsPerBox) || 1);
  if (upb <= 1) return `${totalEA} EA`;
  const boxes = Math.floor(totalEA / upb);
  const rem = totalEA - boxes * upb;
  if (boxes <= 0) return `${rem} EA`;
  if (rem <= 0) return `${boxes} box${boxes === 1 ? "" : "es"}`;
  return `${boxes} box${boxes === 1 ? "" : "es"} + ${rem} EA`;
}
