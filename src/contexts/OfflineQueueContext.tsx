"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/lib/supabase";

const STORAGE_KEY = "pos_offline_sale_queue";

export interface QueuedSale {
  clientUuid: string;
  orderPayload: Record<string, unknown>;
  items: Record<string, unknown>[];
  paymentAmount: number | null;
  queuedAt: string;
}

interface OfflineQueueState {
  pendingCount: number;
  syncing: boolean;
  enqueue: (orderPayload: Record<string, unknown>, items: Record<string, unknown>[], paymentAmount: number | null) => string;
  flush: () => Promise<void>;
}

const Ctx = createContext<OfflineQueueState | null>(null);

function loadQueue(): QueuedSale[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueue(q: QueuedSale[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(q));
  } catch {
    // storage full/unavailable — the in-memory queue still works for this tab/session
  }
}

export function OfflineQueueProvider({ children }: { children: ReactNode }) {
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const flushingRef = useRef(false);

  useEffect(() => {
    setPendingCount(loadQueue().length);
  }, []);

  const enqueue = useCallback((orderPayload: Record<string, unknown>, items: Record<string, unknown>[], paymentAmount: number | null) => {
    const clientUuid = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const entry: QueuedSale = { clientUuid, orderPayload: { ...orderPayload, client_uuid: clientUuid }, items, paymentAmount, queuedAt: new Date().toISOString() };
    const next = [...loadQueue(), entry];
    saveQueue(next);
    setPendingCount(next.length);
    return clientUuid;
  }, []);

  const flush = useCallback(async () => {
    if (flushingRef.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    flushingRef.current = true;
    setSyncing(true);
    try {
      let current = loadQueue();
      for (const entry of current) {
        // Idempotency: if this exact sale already made it to the server on a
        // previous attempt (e.g. the app closed mid-sync), don't insert twice.
        const { data: existing } = await supabase.from("posinv_orders").select("id").eq("client_uuid", entry.clientUuid).maybeSingle();
        let orderId = existing?.id as number | undefined;
        if (!orderId) {
          const { data: order, error: oe } = await supabase.from("posinv_orders").insert(entry.orderPayload).select("id").single();
          if (oe) break; // still offline, or a real failure — stop here, retry everything from here next time
          orderId = order.id;
          const items = entry.items.map((i) => ({ ...i, order_id: orderId }));
          const { error: ie } = await supabase.from("posinv_order_items").insert(items);
          if (ie) break;
          if (entry.paymentAmount && entry.paymentAmount > 0) {
            await supabase.from("posinv_order_payments").insert({ order_id: orderId, amount: entry.paymentAmount, note: "Payment at time of sale" });
          }
        }
        current = current.filter((e) => e.clientUuid !== entry.clientUuid);
        saveQueue(current);
        setPendingCount(current.length);
      }
    } finally {
      setSyncing(false);
      flushingRef.current = false;
    }
  }, []);

  useEffect(() => {
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [flush]);

  return <Ctx.Provider value={{ pendingCount, syncing, enqueue, flush }}>{children}</Ctx.Provider>;
}

export function useOfflineQueue() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOfflineQueue must be used within OfflineQueueProvider");
  return ctx;
}
