import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Product } from "@/lib/types";

const PRODUCT_COLUMNS = "sku,name,description,category,subcategory,sales_price,purchase_price,box_sales_price,box_purchase_price,units_per_box,image_url";

/** Shared by every screen that needs the product catalog + live on-hand stock. */
export function useCatalog() {
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const [{ data: prods, error }, { data: inv }] = await Promise.all([
      supabase.from("posinv_products").select(PRODUCT_COLUMNS).eq("active", true).order("name"),
      supabase.from("posinv_inventory").select("sku,on_hand"),
    ]);
    if (!error) setProducts(prods || []);
    const s: Record<string, number> = {};
    (inv || []).forEach((r) => (s[r.sku] = Number(r.on_hand)));
    setStock(s);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { products, stock, loading, reload };
}

export function deriveCategories(products: Product[]): string[] {
  return Array.from(new Set(products.map((p) => p.category).filter(Boolean) as string[]));
}
