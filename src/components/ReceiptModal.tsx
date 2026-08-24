"use client";
import { useSettings } from "@/contexts/SettingsContext";
import { money } from "@/lib/format";

export interface ReceiptData {
  orderId: number;
  orderOn: string;
  type: "SALE" | "PURCHASE";
  status: string;
  party: string;
  cashierName: string;
  items: { qty: number; unit: "EA" | "BOX"; product_name: string; disc_pct: number; line_total: number }[];
  sub: number;
  tax: number;
  grand: number;
  tendered?: number;
  balanceDue?: number;
  reprint?: boolean;
}

export default function ReceiptModal({ data, onClose }: { data: ReceiptData; onClose: () => void }) {
  const { settings } = useSettings();
  const currency = settings.currency;
  const isSale = data.type === "SALE";
  const chg = Math.max(0, (data.tendered || 0) - data.grand);

  return (
    <div className="modal" id="receipt">
      <div className="mbox">
        <div className="big">{data.reprint ? "🧾" : "✅"}</div>
        <div className="rc">
          {settings.logo_url && (
            <div className="c">
              <img src={settings.logo_url} alt="" style={{ maxHeight: 48, maxWidth: 140, objectFit: "contain" }} />
            </div>
          )}
          <h4>{settings.store_name || "Store"}</h4>
          <div className="c">
            {isSale ? "SALES RECEIPT" : "PURCHASE ORDER"}
            {data.status !== "Paid" ? " — " + data.status.toUpperCase() : ""}
          </div>
          <div className="c">
            Order #{data.orderId} · {new Date(data.orderOn).toLocaleString()}
          </div>
          <div className="c">
            {isSale ? "Customer" : "Vendor"}: {data.party} · Cashier: {data.cashierName || "—"}
          </div>
          <hr />
          <table>
            <tbody>
              {data.items.map((i, idx) => (
                <tr key={idx}>
                  <td>
                    {i.qty}
                    {i.unit === "BOX" ? " Box" : "×"} {i.product_name}
                    {i.disc_pct > 0 ? ` (${Math.round(i.disc_pct * 100)}% off)` : ""}
                  </td>
                  <td className="tr">{money(i.line_total, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <hr />
          <table>
            <tbody>
              <tr>
                <td>Subtotal</td>
                <td className="tr">{money(data.sub, currency)}</td>
              </tr>
              {isSale && (
                <tr>
                  <td>
                    {settings.tax_name}
                    {settings.tax_inclusive ? " (incl.)" : ""}
                  </td>
                  <td className="tr">{money(data.tax, currency)}</td>
                </tr>
              )}
              <tr>
                <td>
                  <b>Total</b>
                </td>
                <td className="tr">
                  <b>{money(data.grand, currency)}</b>
                </td>
              </tr>
              {isSale && data.tendered ? (
                <>
                  <tr>
                    <td>Tendered</td>
                    <td className="tr">{money(data.tendered, currency)}</td>
                  </tr>
                  {data.balanceDue ? (
                    <tr>
                      <td>
                        <b>Balance due</b>
                      </td>
                      <td className="tr">
                        <b>{money(data.balanceDue, currency)}</b>
                      </td>
                    </tr>
                  ) : (
                    <tr>
                      <td>Change</td>
                      <td className="tr">{money(chg, currency)}</td>
                    </tr>
                  )}
                </>
              ) : null}
            </tbody>
          </table>
          <hr />
          <div className="c">{settings.footer_message || "Thank you!"}</div>
        </div>
        <button className="btn noprint" onClick={() => window.print()}>
          🖨️ Print / Share
        </button>
        <button className="btn sec noprint" onClick={onClose}>
          {data.reprint ? "Close" : "New order"}
        </button>
      </div>
    </div>
  );
}
