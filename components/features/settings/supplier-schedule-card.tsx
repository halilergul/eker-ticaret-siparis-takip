import { RecentRunsList } from "@/components/features/settings/recent-runs-list";
import { ScheduleForm } from "@/components/features/settings/schedule-form";
import { Notice } from "@/components/ui/notice";
import { StatusPill } from "@/components/ui/status-pill";
import { TriggerButton } from "@/components/features/scrape/trigger-button";
import { formatTrDateTime } from "@/lib/format/date";
import {
  calculateNextRunAt,
  type ScheduleRow,
} from "@/lib/queries/scrape-schedule";
import { getLatestRunBySupplier } from "@/lib/queries/scrape-runs";

/**
 * Supplier schedule card per design brief §5.4.
 *
 * One full-width glass card per supplier inside /dashboard/settings:
 * - Header: supplier name + slug + Kontrol et button
 * - Status line: last auto-run datetime + status pill
 * - Notice if auto-scrape is off (info intent, no dismiss)
 * - Schedule form (toggle + hour select + save)
 * - Recent runs table (last 10)
 */

type Props = {
  schedule: ScheduleRow;
};

const STATUS_LABEL: Record<NonNullable<ScheduleRow["lastAutoRunStatus"]>, string> = {
  success: "Başarılı",
  partial: "Kısmi",
  failed: "Başarısız",
  aborted: "Durduruldu",
};

const STATUS_INTENT: Record<
  NonNullable<ScheduleRow["lastAutoRunStatus"]>,
  "success" | "warning" | "danger" | "neutral"
> = {
  success: "success",
  partial: "warning",
  failed: "danger",
  aborted: "neutral",
};

function formatNextRun(date: Date | null): string {
  if (!date) return "Otomatik yenileme kapalı.";
  const formatter = new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  });
  return `Sonraki otomatik yenileme: ${formatter.format(date)} (Türkiye saati)`;
}

export async function SupplierScheduleCard({ schedule }: Props) {
  const nextRun = calculateNextRunAt(schedule.enabled, schedule.dailyHourUtc);
  const lastRun = await getLatestRunBySupplier(schedule.supplierId);

  return (
    <article className="et-glass rounded-[20px] p-6">
      {/* Header: name + slug + Kontrol et */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="t-cap mb-1">{schedule.supplierSlug}</div>
          <h2 className="t-h2 text-slate-900">{schedule.supplierName}</h2>
        </div>
        <div className="w-full sm:w-auto sm:min-w-45">
          <TriggerButton
            supplierSlug={schedule.supplierSlug}
            initialLastRun={
              lastRun
                ? {
                    runId: lastRun.id,
                    status: lastRun.status,
                    triggerType: lastRun.triggerType,
                    startedAt: lastRun.startedAt,
                    finishedAt: lastRun.finishedAt,
                    ordersInserted: lastRun.ordersInserted,
                    itemsInserted: lastRun.itemsInserted,
                    snapshotsAdded: lastRun.snapshotsAdded,
                    errorsCount: lastRun.errorsCount,
                  }
                : null
            }
          />
        </div>
      </div>

      {/* Last auto run */}
      {schedule.lastAutoRunAt ? (
        <div className="mb-4 flex items-center gap-3 text-[13px]">
          <span className="text-slate-500">Son otomatik koşum:</span>
          <span className="font-medium text-slate-900 tnum">
            {formatTrDateTime(schedule.lastAutoRunAt)}
          </span>
          {schedule.lastAutoRunStatus ? (
            <StatusPill intent={STATUS_INTENT[schedule.lastAutoRunStatus]}>
              {STATUS_LABEL[schedule.lastAutoRunStatus]}
            </StatusPill>
          ) : null}
        </div>
      ) : null}

      {/* Disabled notice */}
      {!schedule.enabled ? (
        <div className="mb-4">
          <Notice
            intent="info"
            title="Otomatik yenileme kapalı"
            body="Manuel tetikleme gerekiyor. Aşağıdan açıp günlük saati ayarlayabilirsin."
          />
        </div>
      ) : null}

      {/* Schedule form section */}
      <section className="mb-5 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h3 className="t-h3 mb-3 text-slate-900">Otomatik yenileme ayarları</h3>
        <ScheduleForm
          supplierSlug={schedule.supplierSlug}
          initialEnabled={schedule.enabled}
          initialDailyHourUtc={schedule.dailyHourUtc}
        />
        <p className="mt-3 text-xs text-slate-500">{formatNextRun(nextRun)}</p>
      </section>

      {/* Recent runs */}
      <section className="space-y-2">
        <h3 className="t-h3 text-slate-900">Son koşumlar</h3>
        <RecentRunsList supplierId={schedule.supplierId} />
      </section>
    </article>
  );
}
