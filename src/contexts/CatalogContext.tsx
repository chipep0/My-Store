"use client";
import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useCart } from "@/contexts/CartContext";
import type { Product } from "@/lib/types";

const PRODUCT_COLUMNS = "sku,name,description,category,subcategory,sales_price,purchase_price,box_sales_price,box_purchase_price,units_per_box,image_url";

interface CatalogContextValue {
  products: Product[];
  stock: Record<string, number>;
  loading: boolean;
  reload: () => Promise<Product[]>;
}

const CatalogContext = createContext<CatalogContextValue | null>(null);

// Mounted once in the (app) layout, above the router — so the catalog +
// on-hand stock (and every product image already painted from it) survive
// switching screens. Without this, each screen owned its own copy via a
// plain hook, so leaving /pos and coming back remounted the grid from
// scratch: a blank Loading screen, a fresh fetch, and every product image
// re-requested even though nothing had changed.
export function CatalogProvider({ children }: { children: ReactNode }) {
  const { catalogVersion } = useCart();
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [{ data: prods, error }, { data: inv }] = await Promise.all([
      supabase.from("posinv_products").select(PRODUCT_COLUMNS).eq("active", true).order("name"),
      supabase.from("posinv_inventory").select("sku,on_hand"),
    ]);
    if (!error) setProducts(prods || []);
    const s: Record<string, number> = {};
    (inv || []).forEach((r) => (s[r.sku] = Number(r.on_hand)));
    setStock(s);
    setLoading(false);
    return prods || [];
  }, []);

  // Re-fetch whenever a sale/purchase completes anywhere in the app, so
  // on-hand counts and the grid never go stale after checkout. This does
  // NOT reset `loading` back to true, so an in-place refresh updates
  // silently instead of blanking the grid the way a first load does.
  useEffect(() => {
    reload();
  }, [reload, catalogVersion]);

  return <CatalogContext.Provider value={{ products, stock, loading, reload }}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog must be used within a CatalogProvider");
  return ctx;
}

export function deriveCategories(products: Product[]): string[] {
  return Array.from(new Set(products.map((p) => p.category).filter(Boolean) as string[]));
}
