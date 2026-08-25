"use client";
import { useMemo, useState } from "react";
import { guardedDelete } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { useCatalog, deriveCategories } from "@/hooks/useCatalog";
import type { Product } from "@/lib/types";
import ProductCard from "@/components/ProductCard";
import ProductModal from "@/components/ProductModal";
import Loading from "@/components/Loading";

export default function PosPage() {
  const { canPurchase, isManager } = useAuth();
  const { mode, setMode, addToCart, openCart } = useCart();
  const { products, stock, loading, reload } = useCatalog();
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState("All");
  const [activeSub, setActiveSub] = useState("All");
  const [addOpen, setAddOpen] = useState(false);

  const categories = useMemo(() => ["All", ...deriveCategories(products)], [products]);
  const subcategories = useMemo(() => {
    if (activeCat === "All") return [];
    return ["All", ...Array.from(new Set(products.filter((p) => p.category === activeCat).map((p) => p.subcategory).filter(Boolean) as string[]))];
  }, [products, activeCat]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      const okC = activeCat === "All" || p.category === activeCat;
      const okS = activeSub === "All" || p.subcategory === activeSub;
      const okQ = !q || p.name.toLowerCase().includes(q) || String(p.sku).toLowerCase().includes(q);
      return okC && okS && okQ;
    });
  }, [products, search, activeCat, activeSub]);

  const restock = (p: Product) => {
    if (mode !== "PURCHASE") setMode("PURCHASE");
    addToCart(p, "EA");
    openCart();
  };

  const deleteProduct = async (p: Product) => {
    if (!confirm(`Delete "${p.name}" from the catalog?\n\nPast sales/purchase history is kept — only the product listing is removed.`)) return;
    const res = await guardedDelete("posinv_products", "sku", p.sku, "deleting products");
    if (!res.ok) return alert(res.error);
    reload();
  };

  return (
    <div id="posView" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div className="tools">
        <div className="searchrow">
          <input placeholder="Search or scan a product…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="scan" title="Scan barcode">
            ▣
          </button>
          {canPurchase && (
            <button className="scan" style={{ background: "var(--ink)" }} title="Add product" onClick={() => setAddOpen(true)}>
              ＋
            </button>
          )}
        </div>
      </div>
      <div className="chips">
        {categories.map((c) => (
          <button
            key={c}
            className={`chip${c === activeCat ? " on" : ""}`}
            onClick={() => {
              setActiveCat(c);
              setActiveSub("All");
            }}
          >
            {c}
          </button>
        ))}
      </div>
      {subcategories.length > 1 && (
        <div className="chips sub">
          {subcategories.map((s) => (
            <button key={s} className={`chip${s === activeSub ? " on" : ""}`} onClick={() => setActiveSub(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="grid">
        {loading ? (
          <Loading />
        ) : filtered.length === 0 ? (
          <div className="empty">No products match.</div>
        ) : (
          filtered.slice(0, 300).map((p) => (
            <ProductCard
              key={p.sku}
              product={p}
              onHand={stock[p.sku] ?? null}
              canPurchase={canPurchase}
              isManager={isManager}
              onAddStock={() => restock(p)}
              onDelete={() => deleteProduct(p)}
            />
          ))
        )}
      </div>
      {addOpen && (
        <ProductModal
          knownCategories={deriveCategories(products)}
          onClose={() => setAddOpen(false)}
          onSaved={async (sku) => {
            setAddOpen(false);
            const fresh = await reload();
            const p = fresh.find((x) => x.sku === sku);
            if (p) addToCart(p, "EA");
          }}
        />
      )}
    </div>
  );
}
