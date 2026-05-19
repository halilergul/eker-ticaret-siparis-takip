import type { Metadata } from "next";
import { Outfit } from "next/font/google";

import "./globals.css";

const outfit = Outfit({
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-outfit",
  display: "swap",
});

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
    <html lang="tr" className={outfit.variable} suppressHydrationWarning>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
