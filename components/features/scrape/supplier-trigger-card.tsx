import { TriggerButton } from "@/components/features/scrape/trigger-button";
import { formatTrDateTime } from "@/lib/format/date";
import type { ScrapeRunRow, ScrapeRunStatus } from "@/lib/queries/scrape-runs";

type Props = {
  supplier: {
    id: string;
    slug: string;
    name: string;
  };
  lastRun: ScrapeRunRow | null;
};

const STATUS_LABEL: Record<ScrapeRunStatus, string> = {
  running: "Çalışıyor",
  success: "Başarılı",
  partial: "Kısmi",
  failed: "Başarısız",
  aborted: "Durduruldu",
};

const STATUS_CLASS: Record<ScrapeRunStatus, string> = {
  running: "bg-sky-100 text-sky-800",
  success: "bg-emerald-100 text-emerald-800",
  partial: "bg-amber-100 text-amber-800",
  failed: "bg-rose-100 text-rose-800",
  aborted: "bg-stone-200 text-stone-800",
};

export function SupplierTriggerCard({ supplier, lastRun }: Props) {
  return (
    <article className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <header className="mb-4">
        <h3 className="text-base font-semibold text-stone-900">
          {supplier.name}
        </h3>
        <p className="text-xs uppercase tracking-wide text-stone-500">
          {supplier.slug}
        </p>
      </header>

      <div className="mb-4 min-h-[2.5rem] text-sm">
        {lastRun ? (
          <div className="space-y-1">
            <p className="text-stone-600">
              Son koşum: {formatTrDateTime(lastRun.startedAt)}
            </p>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[lastRun.status]}`}
            >
              {STATUS_LABEL[lastRun.status]}
            </span>
          </div>
        ) : (
          <p className="text-stone-500">Henüz scrape yapılmadı.</p>
        )}
      </div>

      <TriggerButton
        supplierSlug={supplier.slug}
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
    </article>
  );
}
