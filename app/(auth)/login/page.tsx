import type { Metadata } from "next";

import { LoginForm } from "@/components/features/auth/login-form";

export const metadata: Metadata = {
  title: "Giriş — Eker Ticaret",
};

export default function LoginPage() {
  return (
    <main className="et-page flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="et-glass rounded-3xl p-10">
          <header className="mb-7 flex flex-col items-center text-center">
            <div
              aria-hidden="true"
              className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-linear-to-br from-slate-900 to-slate-700 text-amber-500 text-xl font-bold tracking-tight shadow-md"
            >
              ET
            </div>
            <h1 className="t-h2 m-0 text-slate-900">Hoş geldin</h1>
            <p className="mt-1.5 text-sm text-slate-600">
              Tedarikçi sipariş ve fiyat takip paneli
            </p>
          </header>
          <LoginForm />
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">
          Eker Ticaret &middot; Nalbur Fiyat Takip
        </p>
      </div>
    </main>
  );
}
