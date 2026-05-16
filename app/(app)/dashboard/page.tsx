import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard — Eker Ticaret",
};

export default function DashboardPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Dashboard
        </h1>
        <p className="text-sm text-slate-600">Yakında: fiyat takip kartları</p>
      </header>

      <section className="mt-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-700">
          Tedarikçi sitelerden çekilen fiyatlar burada listelenecek.
        </p>
      </section>
    </main>
  );
}
