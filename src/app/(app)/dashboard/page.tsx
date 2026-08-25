"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { money, signedMoney, localDateStr } from "@/lib/format";
import { fetchSalesAggregate, emptySalesAggregate } from "@/lib/salesAggregate";
import Loading from "@/components/Loading";

const QUICK_LINKS = [
  { href: "/pos", icon: "🛒", label: "POS" },
  { href: "/stock", icon: "📦", label: "Stock" },
  { href: "/debts", icon: "💳", label: "Debts" },
  { href: "/reports", icon: "📊", label: "Reports" },
];

// Reuses the same semantic colors as the app's status badges (b-Paid/b-Open/
// b-Void/b-Refund) so a status means the same color everywhere in the app.
const STATUS_COLORS: Record<string, string> = {
  Paid: "var(--ok)",
  Open: "var(--warn)",
  Void: "var(--danger)",
  Refund: "#5661c9",
};

export default function DashboardPage() {
  const { cashier } = useAuth();
  const { settings } = useSettings();
  const currency = settings.currency;
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalSales: 0, cashAtHand: 0, totalOwed: 0, lowStockCount: 0 });
  const [weekSales, setWeekSales] = useState<{ label: string; total: number }[]>([]);
  const [statusCounts, setStatusCounts] = useState<{ status: string; count: number }[]>([]);
  const [pctPaid, setPctPaid] = useState(100);
  const [recentOrders, setRecentOrders] = useState<{ id: number; party: string; status: string; total: number; on: string }[]>([]);
  const [topDebts, setTopDebts] = useState<{ party: string; owed: number }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const today = localDateStr(new Date());
    const dayStart = new Date(today + "T00:00:00");
    const dayEnd = new Date(today + "T23:59:59.999");
    const weekStart = new Date(dayStart);
    weekStart.setDate(weekStart.getDate() - 6);

    const [todayAgg, weekAgg, { data: expenses }, { data: otherIncome }, { data: debtOrders }, { data: prods }, { data: inv }, { data: recent }] = await Promise.all([
      fetchSalesAggregate(dayStart, dayEnd).catch(() => emptySalesAggregate()),
      fetchSalesAggregate(weekStart, dayEnd).catch(() => emptySalesAggregate()),
      supabase.from("posinv_expenses").select("amount").eq("expense_on", today),
      supabase.from("posinv_other_income").select("amount").eq("received_on", today),
      supabase.from("posinv_orders").select("party,balance_due").eq("type", "SALE").eq("status", "Open"),
      supabase.from("posinv_products").select("sku,active"),
      supabase.from("posinv_inventory").select("sku,on_hand"),
      supabase.from("posinv_orders").select("id,order_on,party,status,total_paid").eq("type", "SALE").order("order_on", { ascending: false }).limit(6),
    ]);

    // ---- today's KPI cards ----
    const totalExpenses = (expenses || []).reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const totalOtherIncome = (otherIncome || []).reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const totalSales = todayAgg.posSales + totalOtherIncome;
    const cashAtHand = totalSales - totalExpenses - todayAgg.totalOutstandingDebt - todayAgg.totalDirectPayments;
    const totalOwed = (debtOrders || []).reduce((s, o) => s + (Number(o.balance_due) || 0), 0);

    const stockMap: Record<string, number> = {};
    (inv || []).forEach((r) => (stockMap[r.sku] = Number(r.on_hand)));
    const lowStockCount = (prods || []).filter((p) => p.active !== false && stockMap[p.sku] != null && stockMap[p.sku] <= settings.low_stock).length;
    setStats({ totalSales, cashAtHand, totalOwed, lowStockCount });

    // ---- this week: sales-by-day line chart + status donut + % paid ----
    const dayTotals: Record<string, number> = {};
    weekAgg.validSaleItems.forEach((it) => {
      const key = localDateStr(new Date(it.order_on));
      dayTotals[key] = (dayTotals[key] || 0) + it.line_total;
    });
    const weekArr: { label: string; total: number }[] = [];
    const d = new Date(weekStart);
    for (let i = 0; i < 7; i++) {
      const key = localDateStr(d);
      weekArr.push({ label: d.toLocaleDateString(undefined, { weekday: "short" }), total: dayTotals[key] || 0 });
      d.setDate(d.getDate() + 1);
    }
    setWeekSales(weekArr);

    setStatusCounts(["Paid", "Open", "Void", "Refund"].map((s) => ({ status: s, count: weekAgg.statusCounts[s] || 0 })).filter((s) => s.count > 0));
    setPctPaid(weekAgg.saleOrderCount ? Math.round((weekAgg.paidCount / weekAgg.saleOrderCount) * 100) : 100);

    // ---- recent orders + top debts ----
    setRecentOrders((recent || []).map((o) => ({ id: o.id, party: o.party || "Walk-in", status: o.status, total: Number(o.total_paid) || 0, on: o.order_on })));

    const byParty: Record<string, number> = {};
    (debtOrders || []).forEach((o) => {
      const party = o.party || "Walk-in";
      byParty[party] = (byParty[party] || 0) + (Number(o.balance_due) || 0);
    });
    setTopDebts(
      Object.entries(byParty)
        .map(([party, owed]) => ({ party, owed }))
        .sort((a, b) => b.owed - a.owed)
        .slice(0, 5)
    );

    setLoading(false);
  }, [settings.low_stock]);

  useEffect(() => {
    load();
  }, [load]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  // ---- line chart geometry ----
  const CW = 320,
    CH = 100,
    CPAD = 8;
  const maxSale = Math.max(1, ...weekSales.map((d) => d.total));
  const stepX = weekSales.length > 1 ? (CW - CPAD * 2) / (weekSales.length - 1) : 0;
  const pts = weekSales.map((d, i) => ({
    x: CPAD + i * stepX,
    y: CPAD + (CH - CPAD * 2) * (1 - d.total / maxSale),
    ...d,
  }));
  const linePath = pts.map((p, i) => (i === 0 ? "M" : "L") + p.x + "," + p.y).join(" ");
  const areaPath = pts.length ? `${linePath} L${pts[pts.length - 1].x},${CH - CPAD} L${pts[0].x},${CH - CPAD} Z` : "";

  // ---- donut geometry ----
  const donutTotal = statusCounts.reduce((s, x) => s + x.count, 0);
  const R = 52,
    SW = 22,
    C = 2 * Math.PI * R;
  let acc = 0;
  const segs = statusCounts.map((s) => {
    const dash = donutTotal ? (s.count / donutTotal) * C : 0;
    const seg = { ...s, dash, offset: -acc, color: STATUS_COLORS[s.status] || "var(--muted)" };
    acc += dash;
    return seg;
  });

  return (
    <div className="view">
      <div className="greet">
        {greeting}, {cashier}! 👋
      </div>
      <div className="greetSub">Here&apos;s what&apos;s happening in your store today.</div>

      {loading ? (
        <Loading />
      ) : (
        <>
          <div className="kpiGrid">
            <div className="kpi kpi-teal">
              <div className="ic">💰</div>
              <div className="val">{money(stats.totalSales, currency)}</div>
              <div className="lbl">Total sales (today)</div>
            </div>
            <div className="kpi kpi-green">
              <div className="ic">💵</div>
              <div className="val">{signedMoney(stats.cashAtHand, currency)}</div>
              <div className="lbl">Cash at hand (today)</div>
            </div>
            <div className="kpi kpi-amber">
              <div className="ic">💳</div>
              <div className="val">{money(stats.totalOwed, currency)}</div>
              <div className="lbl">Owed (all debts)</div>
            </div>
            <div className="kpi kpi-red">
              <div className="ic">📦</div>
              <div className="val">{stats.lowStockCount}</div>
              <div className="lbl">Low stock items</div>
            </div>
          </div>

          <div className="dashGrid">
            <div>
              <div className="rpthead" style={{ marginTop: 0 }}>
                Recent orders
              </div>
              <div className="chartCard">
                {recentOrders.length ? (
                  recentOrders.map((o) => (
                    <div className="orderRow" key={o.id}>
                      <span className="dot" style={{ background: STATUS_COLORS[o.status] || "var(--muted)" }} />
                      <span style={{ flex: 1, fontWeight: 700 }}>{o.party}</span>
                      <span style={{ color: "var(--muted)" }}>{new Date(o.on).toLocaleDateString()}</span>
                      <span style={{ fontWeight: 700, minWidth: 70, textAlign: "right" }}>{money(o.total, currency)}</span>
                      <span className={`badge b-${o.status}`}>{o.status}</span>
                    </div>
                  ))
                ) : (
                  <div style={{ color: "var(--muted)", fontSize: 13 }}>No orders yet.</div>
                )}
              </div>

              <div className="rpthead">Sales this week</div>
              <div className="chartCard">
                <svg viewBox={`0 0 ${CW} ${CH + 20}`} width="100%" height={CH + 20} preserveAspectRatio="xMidYMid meet">
                  <defs>
                    <linearGradient id="salesFade" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--teal)" stopOpacity="0.28" />
                      <stop offset="100%" stopColor="var(--teal)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {[0.25, 0.5, 0.75].map((f) => (
                    <line key={f} x1={CPAD} x2={CW - CPAD} y1={CPAD + (CH - CPAD * 2) * f} y2={CPAD + (CH - CPAD * 2) * f} stroke="var(--line)" strokeWidth={1} />
                  ))}
                  {areaPath && <path d={areaPath} fill="url(#salesFade)" stroke="none" />}
                  {linePath && <path d={linePath} fill="none" stroke="var(--teal)" strokeWidth={2} />}
                  {pts.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={3.5} fill="var(--teal)" stroke="#fff" strokeWidth={1.5}>
                      <title>
                        {p.label}: {money(p.total, currency)}
                      </title>
                    </circle>
                  ))}
                  {pts.map((p, i) => (
                    <text key={i} x={p.x} y={CH + 14} textAnchor="middle" fontSize="9" fill="var(--muted)">
                      {p.label}
                    </text>
                  ))}
                </svg>
              </div>
            </div>

            <div>
              <div className="rpthead" style={{ marginTop: 0 }}>
                Orders by status (this week)
              </div>
              <div className="chartCard" style={{ display: "flex", alignItems: "center", gap: 16 }}>
                {donutTotal ? (
                  <>
                    <svg viewBox="0 0 120 120" width={110} height={110} style={{ flexShrink: 0 }}>
                      <g transform="rotate(-90 60 60)">
                        <circle cx={60} cy={60} r={R} fill="none" stroke="var(--line)" strokeWidth={SW} />
                        {segs.map((s, i) => (
                          <circle key={i} cx={60} cy={60} r={R} fill="none" stroke={s.color} strokeWidth={SW} strokeDasharray={`${s.dash} ${C - s.dash}`} strokeDashoffset={s.offset} />
                        ))}
                      </g>
                      <text x={60} y={56} textAnchor="middle" fontSize="20" fontWeight="800" fill="var(--ink)">
                        {donutTotal}
                      </text>
                      <text x={60} y={72} textAnchor="middle" fontSize="10" fill="var(--muted)">
                        orders
                      </text>
                    </svg>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
                      {segs.map((s) => (
                        <div key={s.status} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span className="dot" style={{ background: s.color }} />
                          <span style={{ color: "var(--ink)", fontWeight: 700 }}>{s.status}</span>
                          <span style={{ color: "var(--muted)" }}>{s.count}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ color: "var(--muted)", fontSize: 13 }}>No orders this week yet.</div>
                )}
              </div>

              <div className="rpthead">Payment rate (this week)</div>
              <div className="chartCard">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: 22, fontWeight: 800, color: "var(--ink)" }}>{pctPaid}%</span>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>orders paid in full</span>
                </div>
                <div className="progressTrack">
                  <div className="progressFill" style={{ width: `${pctPaid}%` }} />
                </div>
              </div>

              <div className="rpthead">Top customers owing</div>
              <div className="chartCard">
                {topDebts.length ? (
                  topDebts.map((d) => (
                    <div className="orderRow" key={d.party}>
                      <span style={{ flex: 1, fontWeight: 700 }}>{d.party}</span>
                      <span style={{ fontWeight: 700, color: "var(--warn)" }}>{money(d.owed, currency)}</span>
                    </div>
                  ))
                ) : (
                  <div style={{ color: "var(--muted)", fontSize: 13 }}>No outstanding debts. 🎉</div>
                )}
              </div>
            </div>
          </div>

          <div className="rpthead">Quick links</div>
          <div className="stat4">
            {QUICK_LINKS.map((q) => (
              <Link key={q.href} href={q.href} className="listcard" style={{ textAlign: "center" }}>
                <div style={{ fontSize: 22 }}>{q.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 13, marginTop: 4 }}>{q.label}</div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
