import type { Metadata } from "next";

import { SupplierScheduleCard } from "@/components/features/settings/supplier-schedule-card";
import { listSchedules } from "@/lib/queries/scrape-schedule";

export const metadata: Metadata = {
  title: "Ayarlar — Eker Ticaret",
};

export default async function SettingsPage() {
  const schedules = await listSchedules();

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-stone-900">Ayarlar</h1>
        <p className="text-sm text-stone-600">
          Tedarikçi scrape ayarlarını yönetin ve manuel tetikleme yapın.
        </p>
      </header>

      {schedules.length === 0 ? (
        <div className="rounded-md border border-dashed border-stone-300 bg-stone-50 p-6 text-sm text-stone-600">
          Henüz yapılandırılmış bir tedarikçi yok.
        </div>
      ) : (
        <div className="space-y-6">
          {schedules.map((schedule) => (
            <SupplierScheduleCard
              key={schedule.supplierId}
              schedule={schedule}
            />
          ))}
        </div>
      )}
    </main>
  );
}
