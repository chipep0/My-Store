"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { guardedDelete, guardedUpdate } from "@/lib/db";
import { useSettings } from "@/contexts/SettingsContext";
import { money } from "@/lib/format";
import Loading from "@/components/Loading";
import PromptModal from "@/components/PromptModal";

type Tab = "customers" | "vendors";

interface Party {
  id: number;
  name: string;
  phone?: string | null;
}

export default function PartiesPage() {
  const { settings } = useSettings();
  const [tab, setTab] = useState<Tab>("customers");
  const [customers, setCustomers] = useState<Party[]>([]);
  const [vendors, setVendors] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [renaming, setRenaming] = useState<Party | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: custs }, { data: vends }] = await Promise.all([
      supabase.from("posinv_customers").select("id,name,phone").order("name"),
      supabase.from("posinv_vendors").select("id,name").order("name"),
    ]);
    setCustomers(custs || []);
    setVendors(vends || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const table = tab === "customers" ? "posinv_customers" : "posinv_vendors";
  const orderType = tab === "customers" ? "SALE" : "PURCHASE";
  const list = tab === "customers" ? customers : vendors;

  const rename = async (party: Party, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === party.name) {
      setRenaming(null);
      return;
    }
    const res = await guardedUpdate(table, "id", party.id, { name: trimmed }, `renaming ${tab === "customers" ? "customers" : "vendors"}`);
    if (!res.ok) return alert(res.error);
    // party is a plain-text snapshot on orders, not a foreign key — without
    // this, a renamed customer's older orders/debts would silently split
    // into two buckets on the Debts page, which groups by that same text.
    const { error } = await supabase.from("posinv_orders").update({ party: trimmed }).eq("party", party.name).eq("type", orderType);
    if (error) alert(`Renamed, but couldn't update past orders to match: ${error.message}`);
    setRenaming(null);
    load();
  };

  const remove = async (party: Party) => {
    let warn = "";
    if (tab === "customers") {
      const { data: open } = await supabase.from("posinv_orders").select("balance_due").eq("type", "SALE").eq("status", "Open").eq("party", party.name);
      const owed = (open || []).reduce((s, o) => s + (Number(o.balance_due) || 0), 0);
      if (owed > 0) warn = `\n\nNote: ${party.name} still owes ${money(owed, settings.currency)} — deleting them from this list does NOT clear that debt, it just removes them from the picker/contact list.`;
    }
    if (!confirm(`Remove "${party.name}" from the ${tab === "customers" ? "customer" : "vendor"} list? Past orders keep their record either way.${warn}`)) return;
    const res = await guardedDelete(table, "id", party.id, `deleting ${tab === "customers" ? "customers" : "vendors"}`);
    if (!res.ok) return alert(res.error);
    load();
  };

  return (
    <div className="view">
      <div className="vhead" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Link href="/settings" className="btn sm sec">
          ← Back
        </Link>
        <span>Customers &amp; Vendors</span>
      </div>

      <div className="chips" style={{ padding: "0 0 12px" }}>
        <button className={`chip${tab === "customers" ? " on" : ""}`} onClick={() => setTab("customers")}>
          Customers
        </button>
        <button className={`chip${tab === "vendors" ? " on" : ""}`} onClick={() => setTab("vendors")}>
          Vendors
        </button>
      </div>

      {loading ? (
        <Loading />
      ) : !list.length ? (
        <div className="empty">No {tab} yet — add one from the POS party picker.</div>
      ) : (
        list.map((p) => (
          <div className="listcard" key={p.id}>
            <div className="top">
              <b>{p.name}</b>
            </div>
            {"phone" in p && p.phone && <div className="meta">📞 {p.phone}</div>}
            <div className="acts">
              <button className="act-edit" onClick={() => setRenaming(p)}>
                Rename
              </button>
              <button className="act-void" onClick={() => remove(p)}>
                Delete
              </button>
            </div>
          </div>
        ))
      )}

      {renaming && (
        <PromptModal
          title={`Rename ${tab === "customers" ? "customer" : "vendor"}`}
          initialValue={renaming.name}
          onCancel={() => setRenaming(null)}
          onSave={(name) => rename(renaming, name)}
        />
      )}
    </div>
  );
}
