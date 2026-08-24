"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";

export default function SettingsPage() {
  const { isManager } = useAuth();
  const { settings, save } = useSettings();
  const [form, setForm] = useState(settings);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    setForm(settings);
    setLogoPreview(settings.logo_url || "");
  }, [settings]);

  const onLogoChange = (f: File | null) => {
    setLogoFile(f);
    setLogoPreview(f ? URL.createObjectURL(f) : settings.logo_url || "");
  };

  const onSave = async () => {
    setBusy(true);
    setMsg(null);
    try {
      let logo_url = form.logo_url;
      if (logoFile) {
        const ext = (logoFile.name.split(".").pop() || "png").toLowerCase();
        const path = `_store-logo-${Date.now()}.${ext}`;
        const { error: ue } = await supabase.storage.from("product-images").upload(path, logoFile, { upsert: true, contentType: logoFile.type });
        if (ue) throw ue;
        logo_url = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
      }
      const patch = {
        store_name: form.store_name.trim() || "My Store",
        currency: form.currency.trim() || "$",
        tax_name: form.tax_name.trim() || "Tax",
        tax_rate: Math.round((Number(form.tax_rate) || 0) * 10000) / 1000000,
        low_stock: Number(form.low_stock) || 0,
        footer_message: form.footer_message.trim(),
        backdate_enabled: form.backdate_enabled,
        tax_inclusive: form.tax_inclusive,
        logo_url,
      };
      const res = await save(patch);
      if (res.error) throw new Error(res.error);
      setLogoFile(null);
      setMsg({ text: "Settings saved.", ok: true });
    } catch (err) {
      setMsg({ text: (err instanceof Error ? err.message : "Could not save") + " — make sure all supabase/*.sql migrations have been run.", ok: false });
    } finally {
      setBusy(false);
    }
  };

  const deleteAll = async () => {
    const typed = prompt("This permanently deletes EVERY product in your catalog (sales history is kept). Type DELETE to confirm.");
    if (typed !== "DELETE") return;
    const { data, error } = await supabase.from("posinv_products").delete().neq("sku", "__none__").select("sku");
    if (error) return alert(error.message);
    if (!data || data.length === 0) return alert("Nothing was deleted — either the catalog is already empty, or this account lacks permission.");
    alert(`${data.length} product(s) deleted.`);
  };

  return (
    <div className="view">
      <div className="vhead">Settings</div>

      <div className="listcard">
        <label>Orders</label>
        <div style={{ color: "var(--muted)", fontSize: 12, margin: "0 0 10px" }}>
          View recent sales/purchases{isManager ? ", and refund or void an order" : ""}.
        </div>
        <Link href="/orders" className="btn sec">
          View orders
        </Link>
      </div>

      {isManager && (
        <>
          <div className="listcard">
            <label>Store logo</label>
            <div className="apprev" style={{ backgroundImage: logoPreview ? `url("${logoPreview}")` : "none" }}>
              {!logoPreview && "No logo"}
            </div>
            <input type="file" accept="image/*" onChange={(e) => onLogoChange(e.target.files?.[0] || null)} />
            <div style={{ color: "var(--muted)", fontSize: 12, margin: "4px 2px 10px" }}>
              Shows on the login screen, the app header, and receipts/reports.
            </div>

            <label>Store name</label>
            <input value={form.store_name} onChange={(e) => setForm({ ...form, store_name: e.target.value })} />
            <label>Currency symbol</label>
            <input maxLength={3} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
            <label>Tax name</label>
            <input value={form.tax_name} onChange={(e) => setForm({ ...form, tax_name: e.target.value })} />
            <label>Tax rate %</label>
            <input
              type="number"
              step="0.01"
              min={0}
              max={100}
              value={form.tax_rate * 100}
              onChange={(e) => setForm({ ...form, tax_rate: (parseFloat(e.target.value) || 0) / 100 })}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
              <input type="checkbox" className="chk" checked={form.tax_inclusive} onChange={(e) => setForm({ ...form, tax_inclusive: e.target.checked })} />
              <span style={{ textTransform: "none", fontWeight: 600, color: "var(--ink)" }}>Prices already include tax (VAT-inclusive)</span>
            </label>
            <div style={{ color: "var(--muted)", fontSize: 12, margin: "4px 2px 0" }}>
              On: the ticketed price is charged as-is, tax is just shown as the portion already inside it. Off: tax is added on top at checkout.
            </div>

            <label>Low stock threshold</label>
            <input type="number" min={0} value={form.low_stock} onChange={(e) => setForm({ ...form, low_stock: Number(e.target.value) })} />
            <label>Receipt footer message</label>
            <input value={form.footer_message} onChange={(e) => setForm({ ...form, footer_message: e.target.value })} />

            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16 }}>
              <input type="checkbox" className="chk" checked={form.backdate_enabled} onChange={(e) => setForm({ ...form, backdate_enabled: e.target.checked })} />
              <span style={{ textTransform: "none", fontWeight: 600, color: "var(--ink)" }}>Allow backdated sales/purchases</span>
            </label>
            <div style={{ color: "var(--muted)", fontSize: 12, margin: "4px 2px 0" }}>
              Turn this on to catch up historical data. Turn it back off when you&apos;re done, so new orders always lock to today.
            </div>

            <button className="checkout" style={{ background: "var(--teal)", marginTop: 14 }} disabled={busy} onClick={onSave}>
              {busy ? "Saving…" : "Save settings"}
            </button>
            {msg && <div className={`msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div>}
          </div>

          <div className="listcard">
            <label>Expenses</label>
            <div style={{ color: "var(--muted)", fontSize: 12, margin: "0 0 10px" }}>
              Manage rent, utilities, supplies and other costs from the Expenses tab.
            </div>
          </div>

          <div className="listcard" style={{ borderColor: "var(--danger)" }}>
            <label style={{ color: "var(--danger)" }}>Danger zone</label>
            <div style={{ color: "var(--muted)", fontSize: 12, margin: "0 0 10px" }}>
              Permanently deletes every product in your catalog. Past sales/purchase history is kept.
            </div>
            <button className="btn sec" style={{ borderColor: "var(--danger)", color: "var(--danger)" }} onClick={deleteAll}>
              Delete ALL products
            </button>
          </div>
        </>
      )}
    </div>
  );
}
