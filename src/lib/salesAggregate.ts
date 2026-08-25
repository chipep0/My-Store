import { supabase } from "@/lib/supabase";

export interface OrderRow {
  id: number;
  order_on: string;
  type: "SALE" | "PURCHASE";
  status: string;
  balance_due?: number;
  paid_to?: string | null;
}

export interface SkuTotal {
  name: string;
  total: number;
  qty: number;
  directPayments: Record<string, number>;
}

export interface ValidSaleItem {
  sku: string;
  product_name: string;
  line_total: number;
  base_qty: number;
  order_on: string;
}

export interface SalesAggregate {
  orders: OrderRow[];
  posSales: number;
  totalPurch: number;
  totalDirectPayments: number;
  totalOutstandingDebt: number;
  saleOrderCount: number;
  paidCount: number;
  /** Every SALE order's status, unconditionally (including Void) — for a
   * status breakdown/donut. saleOrderCount/paidCount above exclude Void,
   * matching the "orders paid %" metric, which is a different question. */
  statusCounts: Record<string, number>;
  bySku: Record<string, SkuTotal>;
  byPurchSku: Record<string, { name: string; total: number; qty: number }>;
  countedOrderIds: Set<number>;
  /** Non-void/refund SALE line items, each tagged with its order's date —
   * for callers that need their own time-bucketing (by day, by month, ...)
   * without re-deriving the order join/status filtering themselves. */
  validSaleItems: ValidSaleItem[];
}

/** A zeroed-out aggregate — for callers that want to keep loading the rest
 * of a dashboard/report even if the sales query itself fails. */
export function emptySalesAggregate(): SalesAggregate {
  return {
    orders: [],
    posSales: 0,
    totalPurch: 0,
    totalDirectPayments: 0,
    totalOutstandingDebt: 0,
    saleOrderCount: 0,
    paidCount: 0,
    statusCounts: {},
    bySku: {},
    byPurchSku: {},
    countedOrderIds: new Set<number>(),
    validSaleItems: [],
  };
}

/**
 * Fetches orders + their line items in [start, end] and computes the sales/
 * purchase aggregates every reporting screen needs (Total sales, Direct
 * payments, Purchases, per-SKU breakdowns, order status counts). This is the
 * one place this math lives — the Reports rolling window, compiled reports,
 * and the Dashboard all call this instead of re-deriving it, so a future
 * formula change can't create numbers that quietly disagree between screens.
 *
 * Mirrors the same posinv_order_items query pattern used everywhere else:
 * scoped via the parent order's date through posinv_orders!inner(order_on),
 * not fetched unfiltered — an unbounded select silently truncates at
 * Supabase's default 1000-row cap once the shop has logged that many line
 * items in total.
 */
export async function fetchSalesAggregate(start: Date, end: Date): Promise<SalesAggregate> {
  const [{ data: orders, error: oe }, { data: items, error: ie }] = await Promise.all([
    supabase.from("posinv_orders").select("id,order_on,type,status,balance_due,paid_to").gte("order_on", start.toISOString()).lte("order_on", end.toISOString()),
    supabase
      .from("posinv_order_items")
      .select("order_id,sku,product_name,line_total,base_qty,posinv_orders!inner(order_on)")
      .gte("posinv_orders.order_on", start.toISOString())
      .lte("posinv_orders.order_on", end.toISOString()),
  ]);
  if (oe || ie) throw new Error((oe || ie)?.message || "Could not load sales data");

  const ordMap: Record<number, OrderRow> = {};
  (orders || []).forEach((o) => (ordMap[o.id] = o as OrderRow));

  let posSales = 0,
    totalPurch = 0,
    totalDirectPayments = 0,
    totalOutstandingDebt = 0,
    saleOrderCount = 0,
    paidCount = 0;
  const statusCounts: Record<string, number> = {};
  (orders || []).forEach((o) => {
    if (o.type !== "SALE") return;
    statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
    if (o.status !== "Void") {
      saleOrderCount++;
      if (o.status === "Paid") paidCount++;
      if (o.status === "Open") totalOutstandingDebt += Number(o.balance_due) || 0;
    }
  });

  const bySku: Record<string, SkuTotal> = {};
  const byPurchSku: Record<string, { name: string; total: number; qty: number }> = {};
  const countedOrderIds = new Set<number>();
  const validSaleItems: ValidSaleItem[] = [];

  interface ItemRow {
    order_id: number;
    sku: string;
    product_name: string;
    line_total: number;
    base_qty: number;
  }
  ((items || []) as ItemRow[]).forEach((it) => {
    const o = ordMap[it.order_id];
    if (!o || o.status === "Void" || o.status === "Refund") return;
    const lt = Number(it.line_total) || 0;
    if (o.type === "SALE") {
      posSales += lt;
      if (o.paid_to) totalDirectPayments += lt;
      const s = bySku[it.sku] || (bySku[it.sku] = { name: it.product_name, total: 0, qty: 0, directPayments: {} });
      s.total += lt;
      s.qty += Number(it.base_qty) || 0;
      if (o.paid_to) s.directPayments[o.paid_to] = (s.directPayments[o.paid_to] || 0) + lt;
      validSaleItems.push({ sku: it.sku, product_name: it.product_name, line_total: lt, base_qty: Number(it.base_qty) || 0, order_on: o.order_on });
    } else if (o.type === "PURCHASE") {
      totalPurch += lt;
      const s = byPurchSku[it.sku] || (byPurchSku[it.sku] = { name: it.product_name, total: 0, qty: 0 });
      s.total += lt;
      s.qty += Number(it.base_qty) || 0;
    }
    countedOrderIds.add(o.id);
  });

  return {
    orders: (orders || []) as OrderRow[],
    posSales,
    totalPurch,
    totalDirectPayments,
    totalOutstandingDebt,
    saleOrderCount,
    paidCount,
    statusCounts,
    bySku,
    byPurchSku,
    countedOrderIds,
    validSaleItems,
  };
}
