"use client";
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { guardedUpdate } from "@/lib/db";
import type { StoreSettings } from "@/lib/types";

const DEFAULTS: StoreSettings = {
  id: 1,
  store_name: "My Store",
  tax_name: "Tax",
  tax_rate: 0.0825,
  currency: "$",
  low_stock: 10,
  footer_message: "Thank You For Your Business",
  backdate_enabled: false,
  tax_inclusive: true,
  logo_url: null,
};

interface SettingsState {
  settings: StoreSettings;
  loading: boolean;
  reload: () => Promise<void>;
  save: (patch: Partial<StoreSettings>) => Promise<{ error?: string }>;
}

const SettingsCtx = createContext<SettingsState | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<StoreSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const { data } = await supabase.from("posinv_settings").select("*").eq("id", 1).maybeSingle();
    if (data) setSettings({ ...DEFAULTS, ...data });
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const save = async (patch: Partial<StoreSettings>) => {
    const next = { ...settings, ...patch };
    const res = await guardedUpdate("posinv_settings", "id", 1, patch, "Settings");
    if (!res.ok) return { error: res.error };
    setSettings(next);
    return {};
  };

  return <SettingsCtx.Provider value={{ settings, loading, reload, save }}>{children}</SettingsCtx.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsCtx);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
