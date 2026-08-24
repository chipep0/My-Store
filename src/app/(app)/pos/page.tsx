"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import type { Product } from "@/lib/types";
import ProductCard from "@/components/ProductCard";
import ProductModal from "@/components/ProductModal";

export default function PosPage() {
  const { canPurchase, isManager } = useAuth();
  const { mode, setMode, addToCart } = useCart();
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState("All");
  const [activeSub, setActiveSub] = useState("All");
  const [addOpen, setAddOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: prods, error }, { data: inv }] = await Promise.all([
      supabase
        .from("posinv_products")
        .select("sku,name,description,category,subcategory,sales_price,purchase_price,box_sales_price,box_purchase_price,units_per_box,image_url")
        .eq("active", true)
        .order("name"),
      supabase.from("posinv_inventory").select("sku,on_hand"),
    ]);
    if (!error) setProducts(prods || []);
    const s: Record<string, number> = {};
    (inv || []).forEach((r) => (s[r.sku] = Number(r.on_hand)));
    setStock(s);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const categories = useMemo(() => ["All", ...Array.from(new Set(products.map((p) => p.category).filter(Boolean) as string[]))], [products]);
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
  };

  const deleteProduct = async (p: Product) => {
    if (!confirm(`Delete "${p.name}" from the catalog?\n\nPast sales/purchase history is kept — only the product listing is removed.`)) return;
    const { data, error } = await supabase.from("posinv_products").delete().eq("sku", p.sku).select("sku");
    if (error) return alert("Could not delete: " + error.message);
    if (!data || data.length === 0) return alert("Nothing was deleted — this account may not have permission (deleting products is Manager-only).");
    loadData();
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
          <div className="empty">
            <div className="spin" />
            Loading…
          </div>
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
          knownCategories={Array.from(new Set(products.map((p) => p.category).filter(Boolean) as string[]))}
          onClose={() => setAddOpen(false)}
          onSaved={(sku) => {
            setAddOpen(false);
            loadData();
            const p = products.find((x) => x.sku === sku);
            if (p) addToCart(p, "EA");
          }}
        />
      )}
    </div>
  );
}
