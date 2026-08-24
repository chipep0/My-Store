"use client";
import { useEffect } from "react";

// Registered production-only: a dev-mode SW would intercept Turbopack's
// hot-reload requests and serve stale code while iterating.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
