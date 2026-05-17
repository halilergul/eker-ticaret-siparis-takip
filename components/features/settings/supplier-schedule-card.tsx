import { RecentRunsList } from "@/components/features/settings/recent-runs-list";
import { ScheduleForm } from "@/components/features/settings/schedule-form";
import { TriggerNowButton } from "@/components/features/settings/trigger-now-button";
import { formatTrDateTime } from "@/lib/format/date";
import {
  calculateNextRunAt,
  type ScheduleRow,
} from "@/lib/queries/scrape-schedule";

type Props = {
  schedule: ScheduleRow;
};

const STATUS_LABEL: Record<NonNullable<ScheduleRow["lastAutoRunStatus"]>, string> = {
  success: "Başarılı",
  partial: "Kısmi",
  failed: "Başarısız",
  aborted: "Durduruldu",
};

function formatNextRun(date: Date | null): string {
  if (!date) return "Otomatik scrape kapalı.";
  const formatter = new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
  return `Sonraki otomatik scrape: ${formatter.format(date)} UTC`;
}

export function SupplierScheduleCard({ schedule }: Props) {
  const nextRun = calculateNextRunAt(
    schedule.enabled,
    schedule.dailyHourUtc,
  );

  return (
    <article className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-stone-900">
            {schedule.supplierName}
          </h2>
          <p className="text-xs uppercase tracking-wide text-stone-500">
            {schedule.supplierSlug}
          </p>
        </div>
        <TriggerNowButton supplierSlug={schedule.supplierSlug} />
      </div>

      {schedule.lastAutoRunAt ? (
        <p className="mb-4 text-sm text-stone-600">
          Son otomatik koşum: {formatTrDateTime(schedule.lastAutoRunAt)} ·{" "}
          {schedule.lastAutoRunStatus
            ? STATUS_LABEL[schedule.lastAutoRunStatus]
            : "—"}
        </p>
      ) : null}

      <section className="mb-4 space-y-3 rounded-md bg-stone-50 p-4">
        <h3 className="text-sm font-medium text-stone-700">
          Otomatik scrape ayarları
        </h3>
        <ScheduleForm
          supplierSlug={schedule.supplierSlug}
          initialEnabled={schedule.enabled}
          initialDailyHourUtc={schedule.dailyHourUtc}
        />
        <p className="text-xs text-stone-500">{formatNextRun(nextRun)}</p>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium text-stone-700">Son koşumlar</h3>
        <RecentRunsList supplierId={schedule.supplierId} />
      </section>
    </article>
  );
}
