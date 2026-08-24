"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useCart } from "@/contexts/CartContext";
import { money, unitPriceFor } from "@/lib/format";
import type { Product } from "@/lib/types";
import ProductModal from "@/components/ProductModal";

export default function StockPage() {
  const { isManager, canPurchase } = useAuth();
  const { settings } = useSettings();
  const { setMode, addToCart } = useCart();
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"add" | Product | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: prods }, { data: inv }] = await Promise.all([
      supabase
        .from("posinv_products")
        .select("sku,name,description,category,subcategory,sales_price,purchase_price,box_sales_price,box_purchase_price,units_per_box,image_url")
        .eq("active", true)
        .order("name"),
      supabase.from("posinv_inventory").select("sku,on_hand"),
    ]);
    setProducts(prods || []);
    const s: Record<string, number> = {};
    (inv || []).forEach((r) => (s[r.sku] = Number(r.on_hand)));
    setStock(s);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => !q || p.name.toLowerCase().includes(q) || String(p.sku).toLowerCase().includes(q));
  }, [products, search]);

  const restock = (p: Product) => {
    setMode("PURCHASE");
    addToCart(p, "EA");
    router.push("/pos");
  };

  const deleteProduct = async (p: Product) => {
    if (!confirm(`Delete "${p.name}" from the catalog?\n\nPast sales/purchase history is kept — only the product listing is removed.`)) return;
    const { data, error } = await supabase.from("posinv_products").delete().eq("sku", p.sku).select("sku");
    if (error) return alert("Could not delete: " + error.message);
    if (!data || data.length === 0) return alert("Nothing was deleted — this account may not have permission (deleting products is Manager-only).");
    load();
  };

  const knownCategories = Array.from(new Set(products.map((p) => p.category).filter(Boolean) as string[]));

  return (
    <div className="view">
      <div className="vhead" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>Stock</span>
        {canPurchase && (
          <button className="btn sm" onClick={() => setModal("add")}>
            ＋ Add product
          </button>
        )}
      </div>
      <input placeholder="Search products…" style={{ marginBottom: 12 }} value={search} onChange={(e) => setSearch(e.target.value)} />
      {loading ? (
        <div className="empty">
          <div className="spin" />
          Loading…
        </div>
      ) : !products.length ? (
        <div className="empty">No products yet. Tap ＋ Add product to start your catalog.</div>
      ) : !filtered.length ? (
        <div className="empty">No products match.</div>
      ) : (
        filtered.map((p) => {
          const st = stock[p.sku];
          const upb = Math.max(1, Math.floor(p.units_per_box) || 1);
          let cls = "in",
            tag = "OK";
          if (st != null && st <= 0) {
            cls = "out";
            tag = "OUT";
          } else if (st != null && st <= settings.low_stock) {
            cls = "low";
            tag = "LOW";
          }
          const badge = cls === "out" ? "b-Void" : cls === "low" ? "b-Open" : "b-Paid";
          const stTxt = st == null ? "—" : `${st} EA${upb > 1 ? ` (${Math.floor(st / upb)} box${Math.floor(st / upb) === 1 ? "" : "es"})` : ""}`;
          return (
            <div className="listcard" key={p.sku}>
              <div className="top">
                <b>{p.name}</b>
                <span className={`badge ${badge}`}>{tag}</span>
              </div>
              <div className="meta">
                {p.category || "—"}
                {p.subcategory ? " · " + p.subcategory : ""} · SKU {p.sku}
              </div>
              <div className="meta">
                {stTxt} in stock · {money(unitPriceFor(p, "EA", "SALE"), settings.currency)}{" "}
                {upb > 1 ? "EA / " + money(unitPriceFor(p, "BOX", "SALE"), settings.currency) + " box" : "each"}
              </div>
              <div className="acts">
                {isManager && (
                  <button className="act-edit" onClick={() => setModal(p)}>
                    Edit
                  </button>
                )}
                {canPurchase && (
                  <button className="act-refund" onClick={() => restock(p)}>
                    Add stock
                  </button>
                )}
                {isManager && (
                  <button className="act-void" onClick={() => deleteProduct(p)}>
                    Delete
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}
      {modal && (
        <ProductModal
          editProduct={modal === "add" ? null : modal}
          knownCategories={knownCategories}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}
    </div>
  );
}
