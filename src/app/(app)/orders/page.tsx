"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { guardedUpdate } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { money, localDateStr, defaultFromDate } from "@/lib/format";
import type { Order, OrderStatus } from "@/lib/types";
import ReceiptModal, { ReceiptData } from "@/components/ReceiptModal";
import Loading from "@/components/Loading";

export default function OrdersPage() {
  const { isManager } = useAuth();
  const { settings } = useSettings();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [from, setFrom] = useState(defaultFromDate);
  const [to, setTo] = useState(() => localDateStr(new Date()));
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const start = new Date(from + "T00:00:00");
    const end = new Date(to + "T23:59:59.999");
    let q = supabase
      .from("posinv_orders")
      .select("id,order_on,type,status,party,total_paid,paid_to")
      .gte("order_on", start.toISOString())
      .lte("order_on", end.toISOString())
      .order("order_on", { ascending: false })
      .limit(300);
    const term = search.trim();
    if (term) {
      q = /^\d+$/.test(term) ? q.eq("id", Number(term)) : q.ilike("party", `%${term}%`);
    }
    const { data } = await q;
    setOrders(data || []);
    setLoading(false);
  }, [from, to, search]);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (id: number, status: OrderStatus) => {
    if (!confirm(`Mark order #${id} as ${status}? This adjusts inventory.`)) return;
    const res = await guardedUpdate("posinv_orders", "id", id, { status }, "refund/void");
    if (!res.ok) return alert(res.error);
    load();
  };

  const viewReceipt = async (orderId: number) => {
    const [{ data: order, error: oe }, { data: items, error: ie }] = await Promise.all([
      supabase.from("posinv_orders").select("id,order_on,type,status,party,user_name,total_paid,paid_to").eq("id", orderId).single(),
      supabase.from("posinv_order_items").select("sku,product_name,unit,qty,amount,disc_pct,line_total").eq("order_id", orderId).order("id"),
    ]);
    if (oe || ie || !order) return alert("Could not load receipt: " + (oe || ie)?.message);
    const sub = (items || []).reduce((s, i) => s + Number(i.line_total || 0), 0);
    const grand = Number(order.total_paid) || 0;
    const tax = order.type === "SALE" ? Math.max(0, Math.round((grand - sub) * 100) / 100) : 0;
    setReceipt({
      orderId: order.id,
      orderOn: order.order_on,
      type: order.type,
      status: order.status,
      party: order.party || "",
      cashierName: order.user_name || "",
      items: items || [],
      sub,
      tax,
      grand,
      paidTo: order.paid_to || undefined,
      reprint: true,
    });
  };

  return (
    <div className="view">
      <div className="vhead" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Link href="/settings" className="btn sm sec">
          ← Back
        </Link>
        <span>Recent orders</span>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", margin: "0 0 12px" }}>
        <div style={{ flex: 1, minWidth: 120 }}>
          <label>From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <label>To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div style={{ flex: 2, minWidth: 160 }}>
          <label>Search</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Customer/vendor name or order #" />
        </div>
      </div>

      {loading ? (
        <Loading />
      ) : orders.length === 0 ? (
        <div className="empty">No orders match this date range/search.</div>
      ) : (
        <>
          <div className="mobile-only">
            {orders.map((o) => {
              const canAct = isManager && o.status !== "Void" && o.status !== "Refund";
              return (
                <div className="listcard" key={o.id}>
                  <div className="top">
                    <b>
                      #{o.id} · {money(o.total_paid, settings.currency)}
                    </b>
                    <span className={`badge b-${o.status}`}>{o.status}</span>
                  </div>
                  <div className="meta">
                    <span className={`badge b-${o.type}`}>{o.type}</span> {o.party || ""} · {new Date(o.order_on).toLocaleString()}
                    {o.paid_to ? ` · 💸 Paid directly to ${o.paid_to}` : ""}
                  </div>
                  <div className="acts">
                    <button className="act-edit" onClick={() => viewReceipt(o.id)}>
                      View receipt
                    </button>
                    {canAct && (
                      <>
                        <button className="act-refund" onClick={() => setStatus(o.id, "Refund")}>
                          Refund
                        </button>
                        <button className="act-void" onClick={() => setStatus(o.id, "Void")}>
                          Void
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <table className="dtable desktop-only">
            <thead>
              <tr>
                <th>Order</th>
                <th>Type</th>
                <th>Party</th>
                <th>Date</th>
                <th className="tr">Total</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const canAct = isManager && o.status !== "Void" && o.status !== "Refund";
                return (
                  <tr key={o.id}>
                    <td>#{o.id}</td>
                    <td>
                      <span className={`badge b-${o.type}`}>{o.type}</span>
                    </td>
                    <td>
                      {o.party || ""}
                      {o.paid_to ? ` · 💸 to ${o.paid_to}` : ""}
                    </td>
                    <td>{new Date(o.order_on).toLocaleString()}</td>
                    <td className="tr">{money(o.total_paid, settings.currency)}</td>
                    <td>
                      <span className={`badge b-${o.status}`}>{o.status}</span>
                    </td>
                    <td>
                      <div className="acts">
                        <button className="act-edit" onClick={() => viewReceipt(o.id)}>
                          View receipt
                        </button>
                        {canAct && (
                          <>
                            <button className="act-refund" onClick={() => setStatus(o.id, "Refund")}>
                              Refund
                            </button>
                            <button className="act-void" onClick={() => setStatus(o.id, "Void")}>
                              Void
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
      {receipt && <ReceiptModal data={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}
