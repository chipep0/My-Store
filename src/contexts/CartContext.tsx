"use client";
import { createContext, useContext, useState, ReactNode, useMemo, useCallback, useEffect } from "react";
import type { CartLine, Product, OrderType } from "@/lib/types";
import { unitPriceFor } from "@/lib/format";
import { useSettings } from "@/contexts/SettingsContext";
import { supabase } from "@/lib/supabase";

interface Totals {
  gross: number;
  disc: number;
  sub: number;
  tax: number;
  grand: number;
}

interface CartState {
  mode: OrderType;
  setMode: (m: OrderType) => void;
  party: string;
  setParty: (p: string) => void;
  lines: CartLine[];
  addToCart: (product: Product, unit: "EA" | "BOX") => void;
  changeQty: (key: string, delta: number) => void;
  setDisc: (key: string, pct: number) => void;
  clear: () => void;
  count: number;
  totals: Totals;
  lineTotal: (line: CartLine) => number;
  customers: string[];
  vendors: string[];
  addParty: (name: string) => Promise<{ ok: boolean; error?: string }>;
}

const CartCtx = createContext<CartState | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const [mode, setModeRaw] = useState<OrderType>("SALE");
  const [party, setParty] = useState("");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [customers, setCustomers] = useState<string[]>([]);
  const [vendors, setVendors] = useState<string[]>([]);

  useEffect(() => {
    supabase
      .from("posinv_customers")
      .select("name")
      .order("name")
      .then(({ data }) => setCustomers((data || []).map((c) => c.name)));
    supabase
      .from("posinv_vendors")
      .select("name")
      .order("name")
      .then(({ data }) => setVendors((data || []).map((v) => v.name)));
  }, []);

  const addParty = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return { ok: false, error: "Enter a name." };
    const table = mode === "SALE" ? "posinv_customers" : "posinv_vendors";
    const { error } = await supabase.from(table).insert({ name: trimmed });
    if (error) {
      if (error.code === "23505") {
        // Already exists — just select it, not a real failure.
      } else {
        return { ok: false, error: error.message };
      }
    }
    if (mode === "SALE") {
      setCustomers((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed].sort()));
    } else {
      setVendors((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed].sort()));
    }
    setParty(trimmed);
    return { ok: true };
  }, [mode]);

  const setMode = useCallback((m: OrderType) => {
    setModeRaw(m);
    setLines([]);
    setParty("");
  }, []);

  const addToCart = useCallback((product: Product, unit: "EA" | "BOX") => {
    setLines((prev) => {
      const key = `${product.sku}|${unit}`;
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) => (l.key === key ? { ...l, qty: l.qty + 1, product } : l));
      }
      return [...prev, { key, sku: product.sku, unit, product, qty: 1, disc: 0 }];
    });
  }, []);

  const changeQty = useCallback((key: string, delta: number) => {
    setLines((prev) => {
      const next = prev.map((l) => (l.key === key ? { ...l, qty: l.qty + delta } : l));
      return next.filter((l) => l.qty > 0);
    });
  }, []);

  const setDisc = useCallback((key: string, pct: number) => {
    const clamped = Math.max(0, Math.min(100, pct));
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, disc: clamped / 100 } : l)));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const lineTotal = useCallback(
    (line: CartLine) => unitPriceFor(line.product, line.unit, mode) * line.qty * (1 - (line.disc || 0)),
    [mode]
  );

  const totals = useMemo<Totals>(() => {
    let gross = 0;
    let disc = 0;
    lines.forEach((l) => {
      const g = unitPriceFor(l.product, l.unit, mode) * l.qty;
      gross += g * (1 - (l.disc || 0));
      disc += g * (l.disc || 0);
    });
    let sub = gross;
    let tax = 0;
    let grand = gross;
    if (mode === "SALE") {
      if (settings.tax_inclusive) {
        sub = gross / (1 + settings.tax_rate);
        tax = gross - sub;
        grand = gross;
      } else {
        tax = gross * settings.tax_rate;
        grand = gross + tax;
        sub = gross;
      }
    }
    return { gross, disc, sub, tax, grand };
  }, [lines, mode, settings.tax_inclusive, settings.tax_rate]);

  const count = lines.reduce((n, l) => n + l.qty, 0);

  return (
    <CartCtx.Provider value={{ mode, setMode, party, setParty, lines, addToCart, changeQty, setDisc, clear, count, totals, lineTotal, customers, vendors, addParty }}>
      {children}
    </CartCtx.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartCtx);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
