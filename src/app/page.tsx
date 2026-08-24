"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";

export default function LoginPage() {
  const { session, loading, signIn, signUp } = useAuth();
  const { settings } = useSettings();
  const router = useRouter();
  const [signup, setSignup] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!loading && session) router.replace("/pos");
  }, [loading, session, router]);

  const submit = async () => {
    if (!email || !pass) return setMsg({ text: "Enter your email and password.", ok: false });
    setBusy(true);
    setMsg(null);
    try {
      if (signup) {
        const res = await signUp(email, pass, name);
        if (res.error) throw new Error(res.error);
        if (res.needsConfirm) {
          setMsg({ text: "Account created! You can sign in now.", ok: true });
          setSignup(false);
        } else {
          router.replace("/pos");
        }
      } else {
        const res = await signIn(email, pass);
        if (res.error) throw new Error(res.error);
        router.replace("/pos");
      }
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "Login failed.", ok: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div id="login">
      <div className="card">
        <div className="brand">
          <img id="brandLogo" src={settings.logo_url || "/icons/icon-192.png"} alt="" />
          <div>
            <h1 id="brandName">{settings.store_name || "Mobile POS"}</h1>
            <span>with Inventory</span>
          </div>
        </div>
        <h2>{signup ? "Create account" : "Sign in"}</h2>
        <p className="sub">{signup ? "Set up a cashier login." : "Log in to start ringing up sales."}</p>
        {signup && (
          <div>
            <label>Your name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nancy Smith" autoComplete="name" />
          </div>
        )}
        <label>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@store.com" autoComplete="username" />
        <label>Password</label>
        <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
        <button className="btn" onClick={submit} disabled={busy}>
          {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
        </button>
        <div className="toggle">
          {signup ? "Have an account? " : "New here? "}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setSignup(!signup);
              setMsg(null);
            }}
          >
            {signup ? "Sign in" : "Create an account"}
          </a>
        </div>
        {msg && <div className={`msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div>}
      </div>
    </div>
  );
}
