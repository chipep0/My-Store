"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useCart } from "@/contexts/CartContext";
import { useOfflineQueue } from "@/contexts/OfflineQueueContext";
import { CatalogProvider } from "@/contexts/CatalogContext";
import { money } from "@/lib/format";
import CartPanel from "@/components/CartPanel";
import PromptModal from "@/components/PromptModal";

const NAV = [
  { href: "/dashboard", icon: "🏠", label: "Dashboard" },
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
  const { pendingCount, syncing, flush } = useOfflineQueue();
  const router = useRouter();
  const pathname = usePathname();
  const [addPartyOpen, setAddPartyOpen] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    if (!loading && !session) router.replace("/");
  }, [loading, session, router]);

  useEffect(() => {
    setIsOffline(typeof navigator !== "undefined" && !navigator.onLine);
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (loading || !session) return null;

  const currency = settings.currency;
  const visibleNav = NAV.filter((n) => !(n.managerOnly && !isManager) && !(n.hideForTrainee && role === "Trainee"));

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
        {pendingCount > 0 && (
          <button onClick={() => flush()} disabled={syncing} title="Sales queued while offline" style={{ marginRight: 8 }}>
            {syncing ? "Syncing…" : `⏳ ${pendingCount} pending`}
          </button>
        )}
        <button onClick={signOut}>Log out</button>
      </header>

      <div className="appBody">
        <nav className="sidenav">
          {visibleNav.map((n) => (
            <Link key={n.href} href={n.href} className={pathname === n.href ? "on" : ""}>
              <span className="ic">{n.icon}</span>
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="appMain">
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

          {(isOffline || pendingCount > 0) && (
            <div style={{ background: "#fdecec", color: "var(--danger)", fontSize: 12, fontWeight: 700, textAlign: "center", padding: "6px 10px" }}>
              {isOffline ? "📡 You're offline — sales still ring up and queue locally." : "📡 Back online — syncing queued sales…"} Stock counts may not
              reflect other pending sales until they sync.
            </div>
          )}

          <div className="posRow">
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
              <CatalogProvider>{children}</CatalogProvider>
            </div>

            {pathname === "/pos" && <CartPanel open={cartOpen} onClose={closeCart} />}
          </div>
        </div>
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
        {visibleNav.map((n) => (
          <Link key={n.href} href={n.href} className={pathname === n.href ? "on" : ""}>
            <span className="ic">{n.icon}</span>
            {n.label}
          </Link>
        ))}
      </nav>

      {addPartyOpen && (
        <PromptModal
          title={`Add new ${mode === "SALE" ? "customer" : "vendor"}`}
          placeholder={`e.g. ${mode === "SALE" ? "Jane Doe" : "ABC Suppliers"}`}
          saveLabel={`Save ${mode === "SALE" ? "customer" : "vendor"}`}
          required
          requiredMessage={`Enter the ${mode === "SALE" ? "customer" : "vendor"}'s name.`}
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
