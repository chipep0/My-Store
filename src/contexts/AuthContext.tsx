"use client";
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Role } from "@/lib/types";

interface AuthState {
  session: Session | null;
  loading: boolean;
  cashier: string;
  role: Role;
  isManager: boolean;
  canPurchase: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error?: string; needsConfirm?: boolean }>;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<Role>("Staff");

  const loadRole = useCallback(async (userId: string) => {
    const { data } = await supabase.from("posinv_app_users").select("role").eq("id", userId).maybeSingle();
    setRole((data?.role as Role) || "Staff");
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) await loadRole(data.session.user.id);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, sess) => {
      setSession(sess);
      if (sess) await loadRole(sess.user.id);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadRole]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? { error: error.message } : {};
  };

  const signUp = async (email: string, password: string, name: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name: name || email } } });
    if (error) return { error: error.message };
    return { needsConfirm: !data.session };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const cashier = (session?.user.user_metadata?.name as string) || session?.user.email || "";

  const value: AuthState = {
    session,
    loading,
    cashier,
    role,
    isManager: role === "Manager",
    canPurchase: role === "Staff" || role === "Manager",
    signIn,
    signUp,
    signOut,
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
