"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { guardedUpdate } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { money } from "@/lib/format";
import type { OrderPayment } from "@/lib/types";

interface DebtOrder {
  id: number;
  order_on: string;
  party: string;
  total_paid: number;
  balance_due: number;
  items: { product_name: string; qty: number; unit: "EA" | "BOX" }[];
  payments: OrderPayment[];
}

interface DebtGroup {
  party: string;
  owed: number;
  orders: DebtOrder[];
}

export default function DebtsPage() {
  const { settings } = useSettings();
  const { session } = useAuth();
  const currency = settings.currency;
  const [groups, setGroups] = useState<DebtGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [payFor, setPayFor] = useState<DebtOrder | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: orders } = await supabase
      .from("posinv_orders")
      .select("id,order_on,party,total_paid,balance_due")
      .eq("type", "SALE")
      .eq("status", "Open")
      .order("order_on", { ascending: true });
    const ids = (orders || []).map((o) => o.id);
    const [{ data: items }, { data: payments }] = ids.length
      ? await Promise.all([
          supabase.from("posinv_order_items").select("order_id,product_name,qty,unit").in("order_id", ids),
          supabase.from("posinv_order_payments").select("id,order_id,paid_on,amount,note").in("order_id", ids).order("paid_on", { ascending: false }),
        ])
      : [{ data: [] }, { data: [] }];

    const itemsByOrder: Record<number, DebtOrder["items"]> = {};
    (items || []).forEach((it) => {
      (itemsByOrder[it.order_id] ||= []).push({ product_name: it.product_name, qty: it.qty, unit: it.unit });
    });
    const paymentsByOrder: Record<number, OrderPayment[]> = {};
    (payments || []).forEach((p) => {
      (paymentsByOrder[p.order_id] ||= []).push(p as OrderPayment);
    });

    const byParty: Record<string, DebtGroup> = {};
    (orders || []).forEach((o) => {
      const bal = Number(o.balance_due) || 0;
      if (bal <= 0.004) return;
      const party = o.party || "Walk-in";
      const g = byParty[party] || (byParty[party] = { party, owed: 0, orders: [] });
      g.owed += bal;
      g.orders.push({
        id: o.id,
        order_on: o.order_on,
        party,
        total_paid: Number(o.total_paid) || 0,
        balance_due: bal,
        items: itemsByOrder[o.id] || [],
        payments: paymentsByOrder[o.id] || [],
      });
    });
    setGroups(Object.values(byParty).sort((a, b) => b.owed - a.owed));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const recordPayment = async (order: DebtOrder, amount: number) => {
    const amt = Math.round(amount * 100) / 100;
    if (amt <= 0) return alert("Enter an amount greater than 0.");
    if (amt > order.balance_due + 0.004) return alert(`That's more than the ${money(order.balance_due, currency)} still owed on this order.`);
    const { error: pe } = await supabase.from("posinv_order_payments").insert({
      order_id: order.id,
      amount: amt,
      created_by: session?.user.id,
    });
    if (pe) return alert("Could not record payment: " + pe.message);
    const newBalance = Math.round((order.balance_due - amt) * 100) / 100;
    const res = await guardedUpdate("posinv_orders", "id", order.id, { balance_due: newBalance, status: newBalance <= 0.004 ? "Paid" : "Open" }, "updating a debt's balance");
    if (!res.ok) return alert(res.error);
    setPayFor(null);
    load();
  };

  const totalOwed = groups.reduce((s, g) => s + g.owed, 0);

  return (
    <div className="view">
      <div className="vhead">Debts</div>
      {!loading && groups.length > 0 && (
        <div className="stat4" style={{ marginBottom: 14 }}>
          <div className="stat">
            <div className="lbl">Total owed</div>
            <div className="val">{money(totalOwed, currency)}</div>
          </div>
          <div className="stat">
            <div className="lbl">Customers</div>
            <div className="val">{groups.length}</div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="empty">
          <div className="spin" />
          Loading…
        </div>
      ) : !groups.length ? (
        <div className="empty">No outstanding debts. Everyone's paid up. 🎉</div>
      ) : (
        groups.map((g) => (
          <div className="listcard" key={g.party} style={{ marginBottom: 8 }} onClick={() => setExpanded(expanded === g.party ? null : g.party)}>
            <div className="top">
              <b>{g.party}</b>
              <span className="badge b-Open">{money(g.owed, currency)}</span>
            </div>
            <div className="meta">
              {g.orders.length} order{g.orders.length === 1 ? "" : "s"} outstanding
            </div>

            {expanded === g.party && (
              <div style={{ marginTop: 10 }} onClick={(e) => e.stopPropagation()}>
                {g.orders.map((o) => (
                  <div key={o.id} style={{ borderTop: "1px solid var(--line, #eee)", padding: "10px 0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 13 }}>
                      <span>
                        Order #{o.id} · {new Date(o.order_on).toLocaleDateString()}
                      </span>
                      <span>{money(o.balance_due, currency)} owed</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
                      {o.items.map((i, idx) => (
                        <span key={idx}>
                          {i.qty}
                          {i.unit === "BOX" ? " box" : "×"} {i.product_name}
                          {idx < o.items.length - 1 ? ", " : ""}
                        </span>
                      ))}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
                      Total {money(o.total_paid, currency)} · Paid so far {money(o.total_paid - o.balance_due, currency)}
                    </div>
                    {o.payments.length > 0 && (
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                        {o.payments.map((p) => (
                          <div key={p.id}>
                            {new Date(p.paid_on).toLocaleDateString()} — {money(p.amount, currency)}
                            {p.note ? " (" + p.note + ")" : ""}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="acts">
                      <button className="act-void" onClick={() => setPayFor(o)}>
                        Record payment
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      )}

      {payFor && <PaymentModal order={payFor} currency={currency} onCancel={() => setPayFor(null)} onConfirm={(amt) => recordPayment(payFor, amt)} />}
    </div>
  );
}

function PaymentModal({ order, currency, onCancel, onConfirm }: { order: DebtOrder; currency: string; onCancel: () => void; onConfirm: (amount: number) => void }) {
  const [amount, setAmount] = useState(String(order.balance_due));
  const [saving, setSaving] = useState(false);

  const confirm = async () => {
    setSaving(true);
    try {
      await onConfirm(parseFloat(amount) || 0);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal">
      <div className="mbox">
        <h3>Record payment — {order.party}</h3>
        <div style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 10px" }}>
          Order #{order.id} · {money(order.balance_due, currency)} still owed
        </div>
        <label>Amount received</label>
        <input type="number" step="0.01" min={0} max={order.balance_due} value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button className="checkout" style={{ background: "var(--teal)" }} disabled={saving} onClick={confirm}>
          {saving ? "Saving…" : "Save payment"}
        </button>
        <button className="btn sec" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
