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
    <html lang="tr">
      <body className="min-h-screen bg-white text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
