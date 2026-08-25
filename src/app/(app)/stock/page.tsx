"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { guardedDelete } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useCart } from "@/contexts/CartContext";
import { useCatalog, deriveCategories } from "@/hooks/useCatalog";
import { money, unitPriceFor, stockClass, stockBadgeVariant, stockTag } from "@/lib/format";
import type { Product } from "@/lib/types";
import ProductModal from "@/components/ProductModal";

export default function StockPage() {
  const { isManager, canPurchase } = useAuth();
  const { settings } = useSettings();
  const { setMode, addToCart, openCart } = useCart();
  const { products, stock, loading, reload } = useCatalog();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"add" | Product | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => !q || p.name.toLowerCase().includes(q) || String(p.sku).toLowerCase().includes(q));
  }, [products, search]);

  const restock = (p: Product) => {
    setMode("PURCHASE");
    addToCart(p, "EA");
    openCart();
    router.push("/pos");
  };

  const deleteProduct = async (p: Product) => {
    if (!confirm(`Delete "${p.name}" from the catalog?\n\nPast sales/purchase history is kept — only the product listing is removed.`)) return;
    const res = await guardedDelete("posinv_products", "sku", p.sku, "deleting products");
    if (!res.ok) return alert(res.error);
    reload();
  };

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
        (() => {
          const rows = filtered.map((p) => {
            const st = stock[p.sku];
            const upb = Math.max(1, Math.floor(p.units_per_box) || 1);
            const cls = stockClass(st, settings.low_stock);
            const boxes = st != null ? Math.floor(st / upb) : 0;
            const stTxt = st == null ? "—" : `${st} EA${upb > 1 ? ` (${boxes} box${boxes === 1 ? "" : "es"})` : ""}`;
            return { p, st, upb, cls, stTxt };
          });
          return (
            <>
              <div className="mobile-only">
                {rows.map(({ p, cls, stTxt, upb }) => (
                  <div className="listcard" key={p.sku}>
                    <div className="top">
                      <b>{p.name}</b>
                      <span className={`badge ${stockBadgeVariant(cls)}`}>{stockTag(cls)}</span>
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
                ))}
              </div>

              <table className="dtable desktop-only">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>SKU</th>
                    <th className="tr">On hand</th>
                    <th className="tr">Price</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ p, cls, stTxt, upb }) => (
                    <tr key={p.sku}>
                      <td>{p.name}</td>
                      <td>
                        {p.category || "—"}
                        {p.subcategory ? " · " + p.subcategory : ""}
                      </td>
                      <td>{p.sku}</td>
                      <td className="tr">
                        {stTxt} <span className={`badge ${stockBadgeVariant(cls)}`}>{stockTag(cls)}</span>
                      </td>
                      <td className="tr">
                        {money(unitPriceFor(p, "EA", "SALE"), settings.currency)}
                        {upb > 1 ? " / " + money(unitPriceFor(p, "BOX", "SALE"), settings.currency) + " box" : ""}
                      </td>
                      <td>
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          );
        })()
      )}
      {modal && (
        <ProductModal
          editProduct={modal === "add" ? null : modal}
          knownCategories={deriveCategories(products)}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
