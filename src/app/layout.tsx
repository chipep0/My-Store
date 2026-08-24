import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { CartProvider } from "@/contexts/CartContext";

export const metadata: Metadata = {
  title: "Mobile POS",
  description: "Mobile Point of Sale with Inventory",
  manifest: "/manifest.json",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AuthProvider>
          <SettingsProvider>
            <CartProvider>{children}</CartProvider>
          </SettingsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
