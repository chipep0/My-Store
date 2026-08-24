"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { money } from "@/lib/format";
import type { Order, OrderStatus } from "@/lib/types";
import ReceiptModal, { ReceiptData } from "@/components/ReceiptModal";

export default function OrdersPage() {
  const { isManager } = useAuth();
  const { settings } = useSettings();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("posinv_orders")
      .select("id,order_on,type,status,party,total_paid")
      .order("order_on", { ascending: false })
      .limit(40);
    setOrders(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (id: number, status: OrderStatus) => {
    if (!confirm(`Mark order #${id} as ${status}? This adjusts inventory.`)) return;
    const { data, error } = await supabase.from("posinv_orders").update({ status }).eq("id", id).select("id");
    if (error) return alert(error.message);
    if (!data || data.length === 0) return alert("Nothing was changed — this account may not have permission (refund/void is Manager-only).");
    load();
  };

  const viewReceipt = async (orderId: number) => {
    const [{ data: order, error: oe }, { data: items, error: ie }] = await Promise.all([
      supabase.from("posinv_orders").select("id,order_on,type,status,party,user_name,total_paid").eq("id", orderId).single(),
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
      {loading ? (
        <div className="empty">
          <div className="spin" />
          Loading…
        </div>
      ) : orders.length === 0 ? (
        <div className="empty">No orders yet.</div>
      ) : (
        orders.map((o) => {
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
        })
      )}
      {receipt && <ReceiptModal data={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}
