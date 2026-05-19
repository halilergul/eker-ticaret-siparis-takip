import type { Metadata } from "next";

import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { SupplierScheduleCard } from "@/components/features/settings/supplier-schedule-card";
import { listSchedules } from "@/lib/queries/scrape-schedule";

export const metadata: Metadata = {
  title: "Ayarlar — Eker Ticaret",
};

export default async function SettingsPage() {
  const schedules = await listSchedules();

  return (
    <PageShell>
      <PageHeader
        title="Ayarlar"
        subtitle="Tedarikçi scrape ayarlarını yönetin ve manuel tetikleme yapın."
      />

      {schedules.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-6 text-sm text-slate-600">
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
    </PageShell>
  );
}
