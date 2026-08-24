"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Product } from "@/lib/types";

const SEED_CATS = ["Coffee", "Tea", "Sweets", "Powder", "Paste"];

export interface ProductPrefill {
  sku?: string;
  name?: string;
  image_url?: string;
}

export default function ProductModal({
  editProduct,
  prefill,
  knownCategories,
  onClose,
  onSaved,
}: {
  editProduct?: Product | null;
  prefill?: ProductPrefill;
  knownCategories: string[];
  onClose: () => void;
  onSaved: (sku: string) => void;
}) {
  const editing = !!editProduct;
  const [sku, setSku] = useState(editProduct?.sku || prefill?.sku || "");
  const [name, setName] = useState(editProduct?.name || prefill?.name || "");
  const [desc, setDesc] = useState(editProduct?.description || "");
  const [cat, setCat] = useState(editProduct?.category || "");
  const [sub, setSub] = useState(editProduct?.subcategory || "");
  const [sale, setSale] = useState(editProduct ? String(editProduct.sales_price) : "");
  const [buy, setBuy] = useState(editProduct ? String(editProduct.purchase_price) : "");
  const [upb, setUpb] = useState(editProduct ? String(editProduct.units_per_box) : "1");
  const [boxSale, setBoxSale] = useState(editProduct?.box_sales_price != null ? String(editProduct.box_sales_price) : "");
  const [boxBuy, setBoxBuy] = useState(editProduct?.box_purchase_price != null ? String(editProduct.box_purchase_price) : "");
  const [boxTouched, setBoxTouched] = useState(editing);
  const [boxes, setBoxes] = useState("0");
  const [each, setEach] = useState("0");
  const imgUrl = editProduct?.image_url || prefill?.image_url || "";
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const upbNum = Math.max(1, parseInt(upb) || 1);

  useEffect(() => {
    let b = Math.max(0, parseInt(boxes) || 0);
    let e = Math.max(0, parseInt(each) || 0);
    if (e >= upbNum) {
      b += Math.floor(e / upbNum);
      e = e % upbNum;
      setBoxes(String(b));
      setEach(String(e));
    }
    if (!boxTouched) {
      setBoxSale(((parseFloat(sale) || 0) * upbNum).toFixed(2));
      setBoxBuy(((parseFloat(buy) || 0) * upbNum).toFixed(2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxes, each, upbNum, sale, buy]);

  const totalUnits = Math.max(0, parseInt(boxes) || 0) * upbNum + Math.max(0, parseInt(each) || 0);
  const preview = imgFile ? URL.createObjectURL(imgFile) : imgUrl;
  const cats = Array.from(new Set([...SEED_CATS, ...knownCategories])).sort();

  const save = async () => {
    if (!sku.trim() || !name.trim()) return alert("Barcode and product name are required.");
    setSaving(true);
    try {
      let image_url = imgUrl;
      if (imgFile) {
        try {
          const ext = (imgFile.name.split(".").pop() || "jpg").toLowerCase();
          const path = `${sku}-${Date.now()}.${ext}`;
          const { error: ue } = await supabase.storage.from("product-images").upload(path, imgFile, { upsert: true, contentType: imgFile.type });
          if (ue) throw ue;
          image_url = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
        } catch (ue) {
          alert("Saved without the photo — to enable photo uploads run 06_products_and_storage.sql.\n(" + (ue instanceof Error ? ue.message : ue) + ")");
        }
      }
      const fields = {
        name: name.trim(),
        description: desc.trim(),
        category: cat.trim(),
        subcategory: sub.trim(),
        sales_price: parseFloat(sale) || 0,
        purchase_price: parseFloat(buy) || 0,
        box_sales_price: upbNum > 1 ? parseFloat(boxSale) || 0 : null,
        box_purchase_price: upbNum > 1 ? parseFloat(boxBuy) || 0 : null,
        units_per_box: upbNum,
        image_url,
      };
      if (editing) {
        const { data, error } = await supabase.from("posinv_products").update(fields).eq("sku", editProduct!.sku).select("sku");
        if (error) throw error;
        if (!data || data.length === 0) throw new Error("Nothing was saved — this account may not have permission (editing products is Manager-only).");
      } else {
        const { error } = await supabase.from("posinv_products").insert({ sku: sku.trim(), ...fields, opening_stock: totalUnits });
        if (error) throw error;
      }
      onSaved(sku.trim());
    } catch (err) {
      alert("Could not save product: " + (err instanceof Error ? err.message : err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal">
      <div className="mbox" id="addModal">
        <h3>{editing ? "Edit product" : "Add product"}</h3>
        <div className="apprev" style={{ backgroundImage: preview ? `url("${preview}")` : "none" }}>
          {!preview && "No image"}
        </div>
        <label>Photo (take one or choose)</label>
        <input type="file" accept="image/*" onChange={(e) => setImgFile(e.target.files?.[0] || null)} />
        <label>Barcode / SKU</label>
        <input value={sku} readOnly={editing || !!prefill?.sku} onChange={(e) => setSku(e.target.value)} placeholder="Scanned code" />
        <label>Product name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Coke 2-liter" />
        <label>Description (optional)</label>
        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. 2-liter bottle, original recipe" />
        <label>Category</label>
        <input value={cat} onChange={(e) => setCat(e.target.value)} list="catList" placeholder="e.g. Coffee" />
        <datalist id="catList">
          {cats.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <label>Subcategory (optional)</label>
        <input value={sub} onChange={(e) => setSub(e.target.value)} placeholder="e.g. Soda" />
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label>Sale $ (EA)</label>
            <input type="number" step="0.01" value={sale} onChange={(e) => setSale(e.target.value)} placeholder="0.00" />
          </div>
          <div style={{ flex: 1 }}>
            <label>Purchase $ (EA)</label>
            <input type="number" step="0.01" value={buy} onChange={(e) => setBuy(e.target.value)} placeholder="0.00" />
          </div>
        </div>
        <label>Units per box (e.g. 10 sachets = 1 box — leave 1 if this product isn&apos;t boxed)</label>
        <input type="number" min={1} value={upb} onChange={(e) => setUpb(e.target.value)} />
        {upbNum > 1 && (
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label>Sale $ (Box)</label>
              <input type="number" step="0.01" value={boxSale} onChange={(e) => { setBoxTouched(true); setBoxSale(e.target.value); }} />
            </div>
            <div style={{ flex: 1 }}>
              <label>Purchase $ (Box)</label>
              <input type="number" step="0.01" value={boxBuy} onChange={(e) => { setBoxTouched(true); setBoxBuy(e.target.value); }} />
            </div>
          </div>
        )}
        {!editing && (
          <>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label>Boxes</label>
                <input type="number" min={0} value={boxes} onChange={(e) => setBoxes(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label>Each (extra units)</label>
                <input type="number" min={0} value={each} onChange={(e) => setEach(e.target.value)} />
              </div>
            </div>
            <div style={{ color: "var(--muted)", fontSize: 12, margin: "6px 2px 0" }}>
              Starting stock: <b>{totalUnits}</b> units total
            </div>
          </>
        )}
        {editing && (
          <div style={{ color: "var(--muted)", fontSize: 12, margin: "6px 2px 0" }}>
            To change stock quantity, use <b>Add stock</b> (📥) instead — this keeps your Excel/Reports numbers accurate.
          </div>
        )}
        <button className="checkout" style={{ background: "var(--teal)" }} disabled={saving} onClick={save}>
          {saving ? "Saving…" : editing ? "Save changes" : "Save product"}
        </button>
        <button className="btn sec" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
