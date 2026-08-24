"use client";
import { useState } from "react";
import { money } from "@/lib/format";

export default function TenderModal({
  grand,
  currency,
  onCancel,
  onConfirm,
}: {
  grand: number;
  currency: string;
  onCancel: () => void;
  onConfirm: (tendered: number) => void;
}) {
  const [val, setVal] = useState(grand.toFixed(2));
  const paid = parseFloat(val) || 0;
  const change = Math.max(0, paid - grand);
  const quick = [...new Set([grand, Math.ceil(grand), Math.ceil(grand / 5) * 5, Math.ceil(grand / 10) * 10].map((v) => v.toFixed(2)))];

  return (
    <div className="modal">
      <div className="mbox tender">
        <h3>Amount tendered</h3>
        <input className="big" type="number" step="0.01" inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} />
        <div className="quick">
          {quick.map((v) => (
            <button key={v} onClick={() => setVal(v)}>
              {money(+v, currency)}
            </button>
          ))}
        </div>
        <div className="changeline">
          <span>Change</span>
          <span>{money(change, currency)}</span>
        </div>
        <button className="checkout" onClick={() => onConfirm(paid)}>
          Complete sale
        </button>
        <button className="btn sec" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
