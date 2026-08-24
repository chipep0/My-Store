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

export function qtyBoxLabel(unitsPerBox: number, totalEA: number): string {
  const upb = Math.max(1, Math.floor(unitsPerBox) || 1);
  if (upb <= 1) return `${totalEA} EA`;
  const boxes = Math.floor(totalEA / upb);
  const rem = totalEA - boxes * upb;
  if (boxes <= 0) return `${rem} EA`;
  if (rem <= 0) return `${boxes} box${boxes === 1 ? "" : "es"}`;
  return `${boxes} box${boxes === 1 ? "" : "es"} + ${rem} EA`;
}
