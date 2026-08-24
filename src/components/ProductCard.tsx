"use client";
import { useSettings } from "@/contexts/SettingsContext";
import { useCart } from "@/contexts/CartContext";
import { money, unitPriceFor, stockClass } from "@/lib/format";
import type { Product } from "@/lib/types";

const CAT_TILE: Record<string, string> = {
  Coffee: "/images/cat-coffee.svg",
  Tea: "/images/cat-tea.svg",
  Sweets: "/images/cat-sweets.svg",
  Powder: "/images/cat-powder.svg",
  Paste: "/images/cat-paste.svg",
};
function tileFor(cat: string | null) {
  return (cat && CAT_TILE[cat]) || "/images/cat-coffee.svg";
}
function imgFor(p: Product) {
  return p.image_url && p.image_url.trim() ? p.image_url : tileFor(p.category);
}

export default function ProductCard({
  product,
  onHand,
  canPurchase,
  isManager,
  onAddStock,
  onDelete,
}: {
  product: Product;
  onHand: number | null;
  canPurchase: boolean;
  isManager: boolean;
  onAddStock: () => void;
  onDelete: () => void;
}) {
  const { settings } = useSettings();
  const { mode, addToCart } = useCart();
  const upb = Math.max(1, Math.floor(product.units_per_box) || 1);
  const cls = stockClass(onHand, settings.low_stock);
  const eaTxt = onHand == null ? "" : cls === "out" ? "Out of stock" : `${onHand} in stock`;
  const boxTxt = onHand == null ? "" : cls === "out" ? "Out of stock" : `${Math.floor(onHand / upb)} boxes`;

  return (
    <>
      <div className="prod">
        <div className="prodMini">
          {canPurchase && (
            <button className="pIcon pStock" title="Add stock (purchase)" onClick={onAddStock}>
              📥
            </button>
          )}
          {isManager && (
            <button className="pIcon pDel" title="Delete product" onClick={onDelete}>
              🗑
            </button>
          )}
        </div>
        <button className="prodTap" onClick={() => addToCart(product, "EA")}>
          <div className="thumb">
            <img src={imgFor(product)} loading="lazy" alt="" onError={(e) => ((e.target as HTMLImageElement).src = tileFor(product.category))} />
          </div>
          <div className="nm">
            {product.name}
            {upb > 1 ? " (EA)" : ""}
          </div>
          <div className="cat">{product.subcategory || product.category || ""}</div>
          <div className="row">
            <span className="pr">{money(unitPriceFor(product, "EA", mode), settings.currency)}</span>
            <span className={`stk ${cls}`}>{eaTxt}</span>
          </div>
        </button>
      </div>
      {upb > 1 && (
        <div className="prod">
          <button className="prodTap" style={{ flex: 1 }} onClick={() => addToCart(product, "BOX")}>
            <div className="thumb">
              <img src={imgFor(product)} loading="lazy" alt="" onError={(e) => ((e.target as HTMLImageElement).src = tileFor(product.category))} />
            </div>
            <div className="nm">
              {product.name} (Box of {upb})
            </div>
            <div className="cat">{product.subcategory || product.category || ""}</div>
            <div className="row">
              <span className="pr">{money(unitPriceFor(product, "BOX", mode), settings.currency)}</span>
              <span className={`stk ${cls}`}>{boxTxt}</span>
            </div>
          </button>
        </div>
      )}
    </>
  );
}
