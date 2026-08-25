"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useCart } from "@/contexts/CartContext";
import { money, signedMoney, qtyBoxLabel, localDateStr } from "@/lib/format";
import type { PeriodArchive } from "@/lib/types";
import CompiledReportModal, { CompiledReport } from "@/components/CompiledReportModal";

interface OrdRow { id: number; order_on: string; type: "SALE" | "PURCHASE"; status: string; balance_due?: number; paid_to?: string | null }
interface ItemRow { order_id: number; sku: string; product_name: string; line_total: number; base_qty: number }

function BarRow({ label, val, max, currency, sub }: { label: string; val: number; max: number; currency: string; sub?: string }) {
  const pct = max > 0 ? Math.max(4, Math.round((val / max) * 100)) : 4;
  return (
    <div className="barrow" style={{ alignItems: "flex-start" }}>
      <div className="bnm" title={label}>
        {label}
        {sub && <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, marginTop: 2 }}>{sub}</div>}
      </div>
      <div className="btrack" style={{ marginTop: sub ? 2 : 0 }}>
        <div className="bfill" style={{ width: pct + "%" }} />
      </div>
      <div className="bval">{money(val, currency)}</div>
    </div>
  );
}

export default function ReportsPage() {
  const { settings } = useSettings();
  const { canPurchase, isManager } = useAuth();
  const { setMode, addToCart, openCart } = useCart();
  const router = useRouter();
  const currency = settings.currency;
  const [showPurchases, setShowPurchases] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ posSales: 0, totalPurch: 0, totalExpenses: 0, totalOtherIncome: 0, totalDirectPayments: 0, totalOutstandingDebt: 0, pctPaid: 100 });
  const [top, setTop] = useState<{ sku: string; name: string; total: number; qty: number; unitsPerBox: number }[]>([]);
  const [months, setMonths] = useState<{ label: string; total: number }[]>([]);
  const [lowStock, setLowStock] = useState<{ sku: string; name: string; category: string | null; st: number }[]>([]);
  const [archive, setArchive] = useState<PeriodArchive[]>([]);
  const [refreshingId, setRefreshingId] = useState<number | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [report, setReport] = useState<CompiledReport | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    const since = new Date();
    since.setDate(1);
    since.setHours(0, 0, 0, 0);
    since.setMonth(since.getMonth() - 11);

    const [{ data: orders }, { data: items }, { data: expenses }, { data: otherIncome }, { data: prods }, { data: inv }, { data: arch }] = await Promise.all([
      supabase.from("posinv_orders").select("id,order_on,type,status,balance_due,paid_to").gte("order_on", since.toISOString()),
      // Scoped via the parent order's date, not fetched unfiltered — an
      // unbounded select silently truncates at Supabase's default 1000-row
      // cap once the shop has logged that many line items in total, which
      // quietly drops the newest sales from every report below.
      supabase
        .from("posinv_order_items")
        .select("order_id,sku,product_name,line_total,base_qty,posinv_orders!inner(order_on)")
        .gte("posinv_orders.order_on", since.toISOString()),
      supabase.from("posinv_expenses").select("amount").gte("expense_on", localDateStr(since)),
      supabase.from("posinv_other_income").select("amount").gte("received_on", localDateStr(since)),
      supabase.from("posinv_products").select("sku,name,category,units_per_box,active"),
      supabase.from("posinv_inventory").select("sku,on_hand"),
      supabase.from("posinv_period_archive").select("*").order("period_start", { ascending: false }).limit(20),
    ]);

    const upbMap: Record<string, number> = {};
    (prods || []).forEach((p) => (upbMap[p.sku] = Number(p.units_per_box) || 1));

    const ordMap: Record<number, OrdRow> = {};
    (orders || []).forEach((o) => (ordMap[o.id] = o as OrdRow));

    let posSales = 0,
      totalPurch = 0,
      paidCount = 0,
      saleOrderCount = 0,
      totalOutstandingDebt = 0,
      totalDirectPayments = 0;
    (orders || []).forEach((o) => {
      if (o.type === "SALE" && o.status !== "Void") {
        saleOrderCount++;
        if (o.status === "Paid") paidCount++;
        if (o.status === "Open") totalOutstandingDebt += Number(o.balance_due) || 0;
      }
    });
    const bySku: Record<string, { name: string; total: number; qty: number }> = {};
    const byMonth: Record<string, number> = {};
    (items as ItemRow[] || []).forEach((it) => {
      const o = ordMap[it.order_id];
      if (!o || o.status === "Void" || o.status === "Refund") return;
      const lt = Number(it.line_total) || 0;
      if (o.type === "SALE") {
        posSales += lt;
        if (o.paid_to) totalDirectPayments += lt;
        const s = bySku[it.sku] || (bySku[it.sku] = { name: it.product_name, total: 0, qty: 0 });
        s.total += lt;
        s.qty += Number(it.base_qty) || 0;
        const d = new Date(o.order_on);
        const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
        byMonth[key] = (byMonth[key] || 0) + lt;
      } else if (o.type === "PURCHASE") {
        totalPurch += lt;
      }
    });
    const totalExpenses = (expenses || []).reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const totalOtherIncome = (otherIncome || []).reduce((s, x) => s + (Number(x.amount) || 0), 0);
    setStats({ posSales, totalPurch, totalExpenses, totalOtherIncome, totalDirectPayments, totalOutstandingDebt, pctPaid: saleOrderCount ? Math.round((paidCount / saleOrderCount) * 100) : 100 });

    const topArr = Object.entries(bySku)
      .map(([sku, v]) => ({ sku, name: v.name, total: v.total, qty: v.qty, unitsPerBox: upbMap[sku] || 1 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
    setTop(topArr);

    const monthsArr: { label: string; total: number }[] = [];
    const d = new Date(since);
    for (let i = 0; i < 12; i++) {
      const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
      monthsArr.push({ label: d.toLocaleDateString(undefined, { month: "short", year: "2-digit" }), total: byMonth[key] || 0 });
      d.setMonth(d.getMonth() + 1);
    }
    setMonths(monthsArr);

    const stockMap: Record<string, number> = {};
    (inv || []).forEach((r) => (stockMap[r.sku] = Number(r.on_hand)));
    const low = (prods || [])
      .filter((p) => p.active !== false)
      .map((p) => ({ sku: p.sku, name: p.name, category: p.category, st: stockMap[p.sku] }))
      .filter((r) => r.st != null && r.st <= settings.low_stock)
      .sort((a, b) => a.st - b.st);
    setLowStock(low);

    setArchive((arch as PeriodArchive[]) || []);
    setLoading(false);
  }, [settings.low_stock]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const compile = async (start: Date, end: Date, label: string, rangeTxt: string) => {
    const [{ data: orders, error: oe }, { data: items, error: ie }, { data: expenses, error: ee }, { data: otherIncome, error: oie }, { data: prods }] = await Promise.all([
      supabase.from("posinv_orders").select("id,order_on,type,status,balance_due,paid_to").gte("order_on", start.toISOString()).lte("order_on", end.toISOString()),
      supabase
        .from("posinv_order_items")
        .select("order_id,sku,product_name,line_total,base_qty,posinv_orders!inner(order_on)")
        .gte("posinv_orders.order_on", start.toISOString())
        .lte("posinv_orders.order_on", end.toISOString()),
      supabase.from("posinv_expenses").select("category,description,amount").gte("expense_on", localDateStr(start)).lte("expense_on", localDateStr(end)),
      supabase.from("posinv_other_income").select("category,recipient,description,amount").gte("received_on", localDateStr(start)).lte("received_on", localDateStr(end)),
      supabase.from("posinv_products").select("sku,units_per_box"),
    ]);
    if (oe || ie || ee || oie) return alert("Could not compile report: " + (oe || ie || ee || oie)?.message);

    const upbMap: Record<string, number> = {};
    (prods || []).forEach((p) => (upbMap[p.sku] = Number(p.units_per_box) || 1));
    const ordMap: Record<number, OrdRow> = {};
    (orders || []).forEach((o) => (ordMap[o.id] = o as OrdRow));

    let posSales = 0,
      totalPurch = 0,
      totalOutstandingDebt = 0,
      totalDirectPayments = 0;
    const bySku: Record<string, { name: string; total: number; qty: number }> = {};
    const byPurchSku: Record<string, { name: string; total: number; qty: number }> = {};
    const counted = new Set<number>();
    (items as ItemRow[] || []).forEach((it) => {
      const o = ordMap[it.order_id];
      if (!o || o.status === "Void" || o.status === "Refund") return;
      const lt = Number(it.line_total) || 0;
      if (o.type === "SALE") {
        posSales += lt;
        if (o.paid_to) totalDirectPayments += lt;
        const s = bySku[it.sku] || (bySku[it.sku] = { name: it.product_name, total: 0, qty: 0 });
        s.total += lt;
        s.qty += Number(it.base_qty) || 0;
      } else if (o.type === "PURCHASE") {
        totalPurch += lt;
        const s = byPurchSku[it.sku] || (byPurchSku[it.sku] = { name: it.product_name, total: 0, qty: 0 });
        s.total += lt;
        s.qty += Number(it.base_qty) || 0;
      }
      counted.add(o.id);
    });
    (orders || []).forEach((o) => {
      if (o.type === "SALE" && o.status === "Open") totalOutstandingDebt += Number(o.balance_due) || 0;
    });
    const totalExpenses = (expenses || []).reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const totalOtherIncome = (otherIncome || []).reduce((s, x) => s + (Number(x.amount) || 0), 0);

    setReport({
      label,
      rangeTxt,
      orderCount: counted.size,
      posSales,
      totalPurch,
      totalExpenses,
      totalOtherIncome,
      totalDirectPayments,
      totalOutstandingDebt,
      showPurchases,
      products: Object.entries(bySku)
        .map(([sku, v]) => ({ sku, name: v.name, total: v.total, qty: v.qty, unitsPerBox: upbMap[sku] || 1 }))
        .sort((a, b) => b.total - a.total),
      expenseLines: expenses || [],
      otherIncomeLines: otherIncome || [],
      purchases: Object.entries(byPurchSku)
        .map(([sku, v]) => ({ sku, name: v.name, total: v.total, qty: v.qty, unitsPerBox: upbMap[sku] || 1 }))
        .sort((a, b) => b.total - a.total),
    });
  };

  const compilePeriod = (period: "day" | "week" | "month") => {
    const end = new Date();
    const start = new Date();
    if (period === "day") start.setHours(0, 0, 0, 0);
    else if (period === "week") {
      const dow = (start.getDay() + 6) % 7;
      start.setDate(start.getDate() - dow);
      start.setHours(0, 0, 0, 0);
    } else {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
    }
    const label = period === "day" ? "DAILY REPORT" : period === "week" ? "WEEKLY REPORT" : "MONTHLY REPORT";
    const rangeTxt = period === "month" ? start.toLocaleDateString(undefined, { month: "long", year: "numeric" }) : `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`;
    compile(start, end, label, rangeTxt);
  };

  const compileCustom = () => {
    if (!from) return alert("Pick a From date.");
    const toVal = to || from;
    const s = new Date(from + "T00:00:00");
    const e = new Date(toVal + "T23:59:59.999");
    if (s > e) return alert("From date must be before the To date.");
    compile(s, e, "DATE RANGE REPORT", from === toVal ? s.toLocaleDateString() : `${s.toLocaleDateString()} – ${e.toLocaleDateString()}`);
  };

  const refreshArchive = async (a: PeriodArchive) => {
    setRefreshingId(a.id);
    try {
      const { error } = await supabase.rpc("posinv_archive_period", { p_type: a.period_type, p_start: a.period_start, p_end: a.period_end });
      if (error) throw error;
      await loadDashboard();
    } catch (err) {
      alert("Could not refresh: " + (err instanceof Error ? err.message : String(err)) + " — run supabase/23_refresh_archive.sql first.");
    } finally {
      setRefreshingId(null);
    }
  };

  const restockLow = async (sku: string) => {
    const { data: p, error } = await supabase.from("posinv_products").select("*").eq("sku", sku).single();
    if (error || !p) return alert("Could not load that product.");
    setMode("PURCHASE");
    addToCart(p, "EA");
    openCart();
    router.push("/pos");
  };

  // Total sales = Products sold + Other Income — every entry always adds,
  // regardless of how it's flagged. Products sold already includes sales
  // paid directly to someone instead of the till (stock still deducted
  // for those — they're real orders), so Cash at hand has to back that
  // amount back out too, alongside Expenses and unpaid credit sales (a
  // debt counts toward Total sales the moment it's rung up, but isn't
  // cash until collected). Amount sent chains straight off Total sales,
  // backing out Expenses, Other Income, and direct payments again — Other
  // Income cancels out entirely (it was never cash either way), leaving
  // Amount sent = Products sold − Expenses − Direct payments.
  const totalSales = stats.posSales + stats.totalOtherIncome;
  const cashAtHand = totalSales - stats.totalExpenses - stats.totalOutstandingDebt - stats.totalDirectPayments;
  const profit = totalSales - stats.totalPurch;
  const netProfit = totalSales - stats.totalExpenses - stats.totalOtherIncome - stats.totalDirectPayments;
  const maxTop = top.length ? top[0].total : 0;
  const maxMonth = Math.max(1, ...months.map((m) => m.total));

  return (
    <div className="view">
      <div className="vhead">
        Reports <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>— last 12 months</span>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 14px" }}>
        <input type="checkbox" className="chk" checked={showPurchases} onChange={(e) => setShowPurchases(e.target.checked)} />
        <span style={{ textTransform: "none", fontWeight: 600, color: "var(--ink)", fontSize: 13 }}>Include purchases (restocking) in reports</span>
      </label>
      <div style={{ display: "flex", gap: 8, margin: "0 0 16px" }}>
        <button className="btn sm" style={{ flex: 1 }} onClick={() => compilePeriod("day")}>
          📄 Today
        </button>
        <button className="btn sm" style={{ flex: 1 }} onClick={() => compilePeriod("week")}>
          📄 This week
        </button>
        <button className="btn sm" style={{ flex: 1 }} onClick={() => compilePeriod("month")}>
          📄 This month
        </button>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", margin: "0 0 16px" }}>
        <div style={{ flex: 1 }}>
          <label>From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label>To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button className="btn sm" style={{ marginBottom: 1 }} onClick={compileCustom}>
          📄 Compile
        </button>
      </div>

      {loading ? (
        <div className="empty">
          <div className="spin" />
          Loading…
        </div>
      ) : (
        <>
          <div className="stat4">
            <div className="stat">
              <div className="lbl">Total sales</div>
              <div className="val">{money(totalSales, currency)}</div>
            </div>
            {stats.totalOtherIncome > 0 && (
              <div className="stat">
                <div className="lbl">Other income</div>
                <div className="val">−{money(stats.totalOtherIncome, currency)}</div>
              </div>
            )}
            {stats.totalDirectPayments > 0 && (
              <div className="stat">
                <div className="lbl">Paid directly (not till)</div>
                <div className="val">−{money(stats.totalDirectPayments, currency)}</div>
              </div>
            )}
            <div className="stat">
              <div className="lbl">Cash at hand</div>
              <div className="val">{money(cashAtHand, currency)}</div>
            </div>
            {stats.totalOutstandingDebt > 0 && (
              <div className="stat">
                <div className="lbl">Owed (debts)</div>
                <div className="val">{money(stats.totalOutstandingDebt, currency)}</div>
              </div>
            )}
            {showPurchases && (
              <div className="stat">
                <div className="lbl">Total purchases</div>
                <div className="val">{money(stats.totalPurch, currency)}</div>
              </div>
            )}
            {showPurchases && (
              <div className="stat">
                <div className="lbl">Gross profit</div>
                <div className="val">{signedMoney(profit, currency)}</div>
              </div>
            )}
            <div className="stat">
              <div className="lbl">Total expenses</div>
              <div className="val">{money(stats.totalExpenses, currency)}</div>
            </div>
            <div className="stat">
              <div className="lbl">Amount sent</div>
              <div className="val">{signedMoney(netProfit, currency)}</div>
            </div>
            <div className="stat">
              <div className="lbl">Orders paid</div>
              <div className="val">{stats.pctPaid}%</div>
            </div>
          </div>

          <div className="rpthead">Top 10 products by sales</div>
          {top.length ? top.map((t) => <BarRow key={t.sku} label={t.name} val={t.total} max={maxTop} currency={currency} sub={qtyBoxLabel(t.unitsPerBox, t.qty)} />) : <div className="empty">No sales yet.</div>}

          <div className="rpthead">Sales by month</div>
          {months.map((m) => (
            <BarRow key={m.label} label={m.label} val={m.total} max={maxMonth} currency={currency} />
          ))}

          <div className="rpthead">Low stock</div>
          {lowStock.length ? (
            lowStock.map((r) => (
              <div className="listcard" key={r.sku}>
                <div className="top">
                  <b>{r.name}</b>
                  <span className={`badge ${r.st <= 0 ? "b-Void" : "b-Open"}`}>{r.st <= 0 ? "OUT" : r.st + " left"}</span>
                </div>
                <div className="meta">
                  {r.category} · SKU {r.sku}
                </div>
                {canPurchase && (
                  <div className="acts">
                    <button className="act-refund" onClick={() => restockLow(r.sku)}>
                      Add stock
                    </button>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="empty">Nothing low. Stock looks healthy. 📦</div>
          )}

          <div className="rpthead">Archived periods</div>
          {archive.length > 0 && (
            <div style={{ color: "var(--muted)", fontSize: 12, margin: "-6px 4px 10px" }}>
              These totals lock in when a week/month/quarter closes, so editing or deleting something dated inside an
              already-closed period won&apos;t update it here on its own — use Refresh totals to recompute one.
            </div>
          )}
          {archive.length ? (
            archive.map((a) => (
              <div className="listcard" key={a.id}>
                <div className="top">
                  <b>
                    {a.period_type[0].toUpperCase() + a.period_type.slice(1)} of {new Date(a.period_start).toLocaleDateString()}
                  </b>
                  <span className="badge b-Paid">{money(a.total_sales, currency)}</span>
                </div>
                <div className="meta">
                  {a.order_count} orders · Purchases {money(a.total_purchase, currency)} · Expenses {money(a.total_expenses || 0, currency)} · Amount sent{" "}
                  {money(a.net_profit || 0, currency)}
                </div>
                {(a.top_products || []).map((p) => (
                  <div key={p.sku} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
                    <span>
                      {p.name} — {p.boxes > 0 ? (p.each > 0 ? `${p.boxes} box${p.boxes === 1 ? "" : "es"} + ${p.each} EA` : `${p.boxes} box${p.boxes === 1 ? "" : "es"}`) : `${p.each} EA`}
                    </span>
                    <span>{money(p.total, currency)}</span>
                  </div>
                ))}
                {isManager && (
                  <div className="acts">
                    <button className="act-edit" disabled={refreshingId === a.id} onClick={() => refreshArchive(a)}>
                      {refreshingId === a.id ? "Refreshing…" : "🔄 Refresh totals"}
                    </button>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="empty">Nothing archived yet — the first week/month/quarter close will appear here automatically.</div>
          )}
        </>
      )}
      {report && <CompiledReportModal report={report} onClose={() => setReport(null)} />}
    </div>
  );
}
