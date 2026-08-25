"use client";
import { Fragment, useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { guardedUpdate } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { money } from "@/lib/format";
import type { OrderPayment } from "@/lib/types";
import Loading from "@/components/Loading";

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

interface Contact {
  phone: string | null;
  notes: string | null;
}

export default function DebtsPage() {
  const { settings } = useSettings();
  const { session } = useAuth();
  const currency = settings.currency;
  const [groups, setGroups] = useState<DebtGroup[]>([]);
  const [contacts, setContacts] = useState<Record<string, Contact>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [payFor, setPayFor] = useState<DebtOrder | null>(null);
  const [editContact, setEditContact] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: orders }, { data: custs }] = await Promise.all([
      supabase
        .from("posinv_orders")
        .select("id,order_on,party,total_paid,balance_due")
        .eq("type", "SALE")
        .eq("status", "Open")
        .order("order_on", { ascending: true }),
      supabase.from("posinv_customers").select("name,phone,notes"),
    ]);
    const contactMap: Record<string, Contact> = {};
    (custs || []).forEach((c) => (contactMap[c.name] = { phone: c.phone, notes: c.notes }));
    setContacts(contactMap);
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

  const saveContact = async (party: string, contact: Contact) => {
    const { error } = await supabase.from("posinv_customers").upsert({ name: party, phone: contact.phone, notes: contact.notes }, { onConflict: "name" });
    if (error) return alert("Could not save contact details: " + error.message);
    setEditContact(null);
    load();
  };

  const totalOwed = groups.reduce((s, g) => s + g.owed, 0);

  const orderDetail = (g: DebtGroup) => (
    <div onClick={(e) => e.stopPropagation()}>
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
  );

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
        <Loading />
      ) : !groups.length ? (
        <div className="empty">No outstanding debts. Everyone's paid up. 🎉</div>
      ) : (
        <>
          <div className="mobile-only">
            {groups.map((g) => (
              <div className="listcard" key={g.party} style={{ marginBottom: 8 }} onClick={() => setExpanded(expanded === g.party ? null : g.party)}>
                <div className="top">
                  <b>{g.party}</b>
                  <span className="badge b-Open">{money(g.owed, currency)}</span>
                </div>
                <div className="meta" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span>
                    {g.orders.length} order{g.orders.length === 1 ? "" : "s"} outstanding
                    {contacts[g.party]?.phone ? " · 📞 " + contacts[g.party].phone : ""}
                  </span>
                  <button
                    className="act-void"
                    style={{ marginLeft: "auto" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditContact(g.party);
                    }}
                  >
                    {contacts[g.party]?.phone || contacts[g.party]?.notes ? "Edit contact" : "Add contact"}
                  </button>
                </div>
                {expanded === g.party && <div style={{ marginTop: 10 }}>{orderDetail(g)}</div>}
              </div>
            ))}
          </div>

          <table className="dtable desktop-only">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Phone</th>
                <th className="tr">Orders</th>
                <th className="tr">Owed</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g.party}>
                  <tr style={{ cursor: "pointer" }} onClick={() => setExpanded(expanded === g.party ? null : g.party)}>
                    <td>
                      <b>{g.party}</b>
                    </td>
                    <td>{contacts[g.party]?.phone || "—"}</td>
                    <td className="tr">{g.orders.length}</td>
                    <td className="tr">{money(g.owed, currency)}</td>
                    <td>
                      <div className="acts">
                        <button
                          className="act-void"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditContact(g.party);
                          }}
                        >
                          {contacts[g.party]?.phone || contacts[g.party]?.notes ? "Edit contact" : "Add contact"}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expanded === g.party && (
                    <tr>
                      <td colSpan={5} style={{ background: "var(--bg)" }}>
                        {orderDetail(g)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </>
      )}

      {payFor && <PaymentModal order={payFor} currency={currency} onCancel={() => setPayFor(null)} onConfirm={(amt) => recordPayment(payFor, amt)} />}
      {editContact && (
        <ContactModal
          party={editContact}
          contact={contacts[editContact] || { phone: null, notes: null }}
          onCancel={() => setEditContact(null)}
          onSave={(c) => saveContact(editContact, c)}
        />
      )}
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

function ContactModal({ party, contact, onCancel, onSave }: { party: string; contact: Contact; onCancel: () => void; onSave: (contact: Contact) => Promise<void> | void }) {
  const [phone, setPhone] = useState(contact.phone || "");
  const [notes, setNotes] = useState(contact.notes || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await onSave({ phone: phone.trim() || null, notes: notes.trim() || null });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal">
      <div className="mbox">
        <h3>Contact details — {party}</h3>
        <label>Phone</label>
        <input type="tel" autoFocus value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 097 123 4567" />
        <label>Notes (optional)</label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. address, alternate contact" />
        <button className="checkout" style={{ background: "var(--teal)" }} disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save contact"}
        </button>
        <button className="btn sec" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
