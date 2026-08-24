"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useCart } from "@/contexts/CartContext";
import { money } from "@/lib/format";
import CartPanel from "@/components/CartPanel";

const NAV = [
  { href: "/pos", icon: "🛒", label: "POS" },
  { href: "/stock", icon: "📦", label: "Stock" },
  { href: "/reports", icon: "📊", label: "Reports" },
  { href: "/debts", icon: "💳", label: "Debts" },
  { href: "/expenses", icon: "💰", label: "Expenses", managerOnly: true },
  { href: "/settings", icon: "⚙️", label: "Settings", hideForTrainee: true },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { session, loading, cashier, role, isManager, signOut } = useAuth();
  const { settings } = useSettings();
  const { mode, party, setParty, customers, vendors, addParty, lines, count, totals, lineTotal, cartOpen, openCart, closeCart, addToCart } = useCart();
  const router = useRouter();
  const pathname = usePathname();
  const [addPartyOpen, setAddPartyOpen] = useState(false);

  useEffect(() => {
    if (!loading && !session) router.replace("/");
  }, [loading, session, router]);

  if (loading || !session) return null;

  const currency = settings.currency;

  return (
    <div id="app" className={mode === "PURCHASE" ? "purchase" : ""}>
      <header>
        {settings.logo_url && <img id="headerLogo" src={settings.logo_url} alt="" style={{ width: 32, height: 32, borderRadius: 8, objectFit: "cover" }} />}
        <div>
          <div className="store">{settings.store_name || "Store"}</div>
          <div className="who">
            Cashier: {cashier} ({role})
          </div>
        </div>
        <div className="sp" />
        <button onClick={signOut}>Log out</button>
      </header>

      {pathname === "/pos" && (
        <div className="modebar">
          <div className="party">
            <select
              value={party}
              onChange={(e) => {
                if (e.target.value === "__new__") setAddPartyOpen(true);
                else setParty(e.target.value);
              }}
            >
              <option value="">{mode === "SALE" ? "Walk-in customer" : "Select vendor"}</option>
              {(mode === "SALE" ? customers : vendors).map((n) => (
                <option key={n}>{n}</option>
              ))}
              <option value="__new__">➕ Add new {mode === "SALE" ? "customer" : "vendor"}…</option>
            </select>
          </div>
        </div>
      )}

      {settings.backdate_enabled && (
        <div style={{ background: "#fff3cd", color: "#8a6d1a", fontSize: 12, fontWeight: 700, textAlign: "center", padding: "6px 10px" }}>
          📅 Backdated entry mode is ON — orders use the date set in the cart, not today. Turn it off in Settings when you&apos;re caught up.
        </div>
      )}

      <div className="posRow">
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>{children}</div>

        {pathname === "/pos" && <CartPanel open={cartOpen} onClose={closeCart} />}
      </div>

      {pathname === "/pos" && (
        <div className="cartbar">
          <div id="cartPreview">
            {lines.map((l) => {
              const unm = l.unit === "BOX" ? " (Box)" : l.product.units_per_box > 1 ? " (EA)" : "";
              return (
                <div className="cpRow" key={l.key} onClick={() => addToCart(l.product, l.unit)}>
                  <span>
                    <b>{l.qty}×</b> {l.product.name}
                    {unm}
                  </span>
                  <span className="cpTot">{money(lineTotal(l), currency)}</span>
                </div>
              );
            })}
          </div>
          <div className="cbSummary" onClick={openCart}>
            <div className="n">{count}</div>
            <div className="lbl">{mode === "SALE" ? "View sale" : "View purchase"}</div>
            <div className="tot">{money(totals.grand, currency)}</div>
          </div>
        </div>
      )}

      <nav className="nav">
        {NAV.filter((n) => !(n.managerOnly && !isManager) && !(n.hideForTrainee && role === "Trainee")).map((n) => (
          <Link key={n.href} href={n.href} className={pathname === n.href ? "on" : ""}>
            <span className="ic">{n.icon}</span>
            {n.label}
          </Link>
        ))}
      </nav>

      {addPartyOpen && (
        <AddPartyModal
          label={mode === "SALE" ? "customer" : "vendor"}
          onCancel={() => setAddPartyOpen(false)}
          onSave={async (name) => {
            const res = await addParty(name);
            if (!res.ok) {
              alert("Could not add: " + res.error);
              return;
            }
            setAddPartyOpen(false);
          }}
        />
      )}
    </div>
  );
}

function AddPartyModal({ label, onCancel, onSave }: { label: string; onCancel: () => void; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return alert(`Enter the ${label}'s name.`);
    setSaving(true);
    try {
      await onSave(name);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal">
      <div className="mbox">
        <h3>Add new {label}</h3>
        <label>Name</label>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={`e.g. ${label === "customer" ? "Jane Doe" : "ABC Suppliers"}`} />
        <button className="checkout" style={{ background: "var(--teal)" }} disabled={saving} onClick={save}>
          {saving ? "Saving…" : `Save ${label}`}
        </button>
        <button className="btn sec" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
