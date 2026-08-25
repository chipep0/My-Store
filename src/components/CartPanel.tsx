"use client";
import { useState } from "react";
import { useCart } from "@/contexts/CartContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { useOfflineQueue } from "@/contexts/OfflineQueueContext";
import { money, localDateStr } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import ReceiptModal, { ReceiptData } from "@/components/ReceiptModal";
import TenderModal from "@/components/TenderModal";

function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /network|fetch|offline/i.test(msg);
}

export default function CartPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { mode, setMode, party, lines, changeQty, setDisc, lineTotal, totals, clear, bumpCatalog } = useCart();
  const { settings } = useSettings();
  const { cashier, session } = useAuth();
  const { enqueue } = useOfflineQueue();
  const [tenderOpen, setTenderOpen] = useState(false);
  const [directOpen, setDirectOpen] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [busy, setBusy] = useState(false);
  const [orderDate, setOrderDate] = useState(() => localDateStr(new Date()));
  const currency = settings.currency;

  const finalize = async (tendered: number, paidTo?: string) => {
    if (lines.length === 0) return;
    const isSale = mode === "SALE";
    const grand = Math.round(totals.grand * 100) / 100;
    const balanceDue = paidTo ? 0 : isSale ? Math.max(0, Math.round((grand - tendered) * 100) / 100) : 0;
    const partyName = party || (mode === "SALE" ? "Walk-in" : "Supplier");

    if (balanceDue > 0) {
      if (!party) {
        alert("Pick a customer before recording a sale on credit — a debt needs a named customer to track.");
        return;
      }
      if (!confirm(`${partyName} paid ${money(tendered, currency)} of ${money(grand, currency)}. Record the remaining ${money(balanceDue, currency)} as debt owed by ${partyName}?`)) {
        return;
      }
    }

    setBusy(true);
    try {
      const status = balanceDue > 0 ? "Open" : "Paid";
      const orderPayload: Record<string, unknown> = {
        type: mode,
        status,
        party: partyName,
        user_name: cashier,
        total_paid: grand,
        balance_due: balanceDue,
        paid_to: paidTo || null,
        created_by: session?.user.id,
      };
      if (settings.backdate_enabled && orderDate) {
        const [y, mo, d] = orderDate.split("-").map(Number);
        const dt = new Date();
        dt.setFullYear(y, mo - 1, d);
        orderPayload.order_on = dt.toISOString();
      }

      // order_id is filled in once the order actually exists — either right
      // below (online) or later during sync (queued offline).
      const itemsBase = lines.map((l) => {
        const upb = Math.max(1, Math.floor(l.product.units_per_box) || 1);
        return {
          type: mode,
          sku: l.sku,
          product_name: l.product.name,
          unit: l.unit,
          qty: l.qty,
          base_qty: l.qty * (l.unit === "BOX" ? upb : 1),
          amount: l.unit === "BOX" ? (mode === "SALE" ? l.product.box_sales_price : l.product.box_purchase_price) || 0 : mode === "SALE" ? l.product.sales_price : l.product.purchase_price,
          disc_pct: l.disc || 0,
          line_total: Math.round(lineTotal(l) * 100) / 100,
        };
      });
      const paymentAmount = status === "Open" && tendered > 0 ? Math.round(tendered * 100) / 100 : null;

      // Offline queueing is scoped to SALEs only — a restock (PURCHASE)
      // still needs a live connection, same as before.
      const canQueue = isSale;
      const offlineNow = canQueue && typeof navigator !== "undefined" && !navigator.onLine;

      let orderId: number | null = null;
      let orderOn = (orderPayload.order_on as string) || new Date().toISOString();
      let queued = false;

      if (offlineNow) {
        enqueue(orderPayload, itemsBase, paymentAmount);
        queued = true;
      } else {
        try {
          const { data: order, error: oe } = await supabase.from("posinv_orders").insert(orderPayload).select("id,order_on").single();
          if (oe) throw oe;
          const items = itemsBase.map((i) => ({ ...i, order_id: order.id }));
          const { error: ie } = await supabase.from("posinv_order_items").insert(items);
          if (ie) throw ie;
          if (paymentAmount) {
            await supabase.from("posinv_order_payments").insert({
              order_id: order.id,
              amount: paymentAmount,
              note: "Payment at time of sale",
              created_by: session?.user.id,
            });
          }
          orderId = order.id;
          orderOn = order.order_on;
        } catch (err) {
          if (canQueue && isNetworkError(err)) {
            enqueue(orderPayload, itemsBase, paymentAmount);
            queued = true;
          } else {
            throw err;
          }
        }
      }

      setReceipt({
        orderId,
        orderOn,
        type: mode,
        status,
        balanceDue,
        party: partyName,
        cashierName: cashier,
        items: itemsBase.map((i) => ({ qty: i.qty, unit: i.unit, product_name: i.product_name, disc_pct: i.disc_pct, line_total: i.line_total })),
        sub: totals.sub,
        tax: totals.tax,
        grand: totals.grand,
        tendered,
        paidTo: paidTo || undefined,
        queued,
      });
      clear();
      if (mode === "PURCHASE") setMode("SALE");
      if (!queued) bumpCatalog();
      onClose();
    } catch (err) {
      alert("Failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
      setTenderOpen(false);
      setDirectOpen(false);
    }
  };

  return (
    <>
      <div className={`drawer${open ? "" : " hidden"}`} id="drawer">
        <div className="sheet">
          <h3>
            {mode === "SALE" ? "Current sale " : "Purchase / restock "}
            <button onClick={onClose}>×</button>
          </h3>
          {settings.backdate_enabled && (
            <div style={{ padding: "0 16px 12px" }}>
              <label>Order date</label>
              <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
            </div>
          )}
          <div className="items">
            {lines.length === 0 ? (
              <div className="empty">Cart is empty. Tap a product to add it.</div>
            ) : (
              lines.map((l) => {
                const unm = l.unit === "BOX" ? " (Box)" : l.product.units_per_box > 1 ? " (EA)" : "";
                const unitPrice = l.unit === "BOX" ? (mode === "SALE" ? l.product.box_sales_price : l.product.box_purchase_price) || 0 : mode === "SALE" ? l.product.sales_price : l.product.purchase_price;
                return (
                  <div className="ci" key={l.key}>
                    <div className="r1">
                      <div className="cinm">
                        <b>
                          {l.product.name}
                          {unm}
                        </b>
                        <span>
                          {money(unitPrice, currency)} per {l.unit === "BOX" ? "box" : "each"}
                        </span>
                      </div>
                      <div className="qty">
                        <button onClick={() => changeQty(l.key, -1)}>−</button>
                        <b>{l.qty}</b>
                        <button onClick={() => changeQty(l.key, 1)}>+</button>
                      </div>
                      <div className="lt">{money(lineTotal(l), currency)}</div>
                    </div>
                    <div className="r2">
                      Discount %{" "}
                      <input
                        type="number"
                        min={0}
                        max={100}
                        defaultValue={Math.round((l.disc || 0) * 100)}
                        onChange={(e) => setDisc(l.key, parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="totals">
            <div className="tl">
              <span>Subtotal{mode === "SALE" && settings.tax_inclusive ? ` (excl. ${settings.tax_name})` : ""}</span>
              <span>{money(totals.sub, currency)}</span>
            </div>
            {totals.disc > 0 && (
              <div className="tl">
                <span>Discounts</span>
                <span>−{money(totals.disc, currency)}</span>
              </div>
            )}
            {mode === "SALE" && (
              <div className="tl">
                <span>
                  {settings.tax_name} ({(settings.tax_rate * 100).toFixed(2).replace(/\.00$/, "")}%{settings.tax_inclusive ? ", incl." : ""})
                </span>
                <span>{money(totals.tax, currency)}</span>
              </div>
            )}
            <div className="tl grand">
              <span>Total</span>
              <span>{money(totals.grand, currency)}</span>
            </div>
            <button
              className="checkout"
              disabled={lines.length === 0 || busy}
              onClick={() => (mode === "SALE" ? setTenderOpen(true) : finalize(0))}
            >
              {mode === "SALE" ? "Charge " : "Receive stock "}
              {money(totals.grand, currency)}
            </button>
            {mode === "SALE" && (
              <button className="btn sec" style={{ marginTop: 8 }} disabled={lines.length === 0 || busy} onClick={() => setDirectOpen(true)}>
                💸 Paid directly to someone (not the till)
              </button>
            )}
          </div>
        </div>
      </div>
      {tenderOpen && <TenderModal grand={totals.grand} currency={currency} onCancel={() => setTenderOpen(false)} onConfirm={finalize} />}
      {directOpen && (
        <DirectPaymentModal grand={totals.grand} currency={currency} onCancel={() => setDirectOpen(false)} onConfirm={(paidTo) => finalize(totals.grand, paidTo)} />
      )}
      {receipt && <ReceiptModal data={receipt} onClose={() => setReceipt(null)} />}
    </>
  );
}

function DirectPaymentModal({ grand, currency, onCancel, onConfirm }: { grand: number; currency: string; onCancel: () => void; onConfirm: (paidTo: string) => void }) {
  const [paidTo, setPaidTo] = useState("");
  const [saving, setSaving] = useState(false);

  const confirm = async () => {
    if (!paidTo.trim()) return alert("Enter who the payment was sent to.");
    setSaving(true);
    try {
      await onConfirm(paidTo.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal">
      <div className="mbox">
        <h3>Paid directly — {money(grand, currency)}</h3>
        <div style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 10px" }}>
          The goods left as a normal sale (stock still deducts), but the payment went straight to a person/account instead of
          the till.
        </div>
        <label>Sent to (person / account)</label>
        <input autoFocus value={paidTo} onChange={(e) => setPaidTo(e.target.value)} placeholder="e.g. Mr Romeo, or the bank account" />
        <button className="checkout" style={{ background: "var(--teal)" }} disabled={saving} onClick={confirm}>
          {saving ? "Saving…" : "Confirm sale"}
        </button>
        <button className="btn sec" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
