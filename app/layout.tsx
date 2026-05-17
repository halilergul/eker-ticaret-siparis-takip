import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Eker Ticaret — Fiyat Takip",
  description:
    "Tedarikçi B2B sitelerinden alınan ürünlerin fiyat değişimlerini takip eden dashboard.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: bazı privacy/analytics browser extension'ları
    // <html> tag'a attribute ekliyor (Google Analytics Opt-Out vs.) — bilinen
    // false-positive hydration mismatch.
    <html lang="tr" suppressHydrationWarning>
      <body className="min-h-screen bg-white text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
