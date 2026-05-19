import { TriggerButton } from "@/components/features/scrape/trigger-button";
import { Icon } from "@/components/ui/icon";
import { StatusPill } from "@/components/ui/status-pill";
import { formatTrDateTime } from "@/lib/format/date";
import type { ScrapeRunRow, ScrapeRunStatus } from "@/lib/queries/scrape-runs";

/**
 * Supplier trigger card — signature dashboard component per design brief §3.2.
 *
 * Glass surface (rounded 20px, et-glass), top: supplier name + slug + truck
 * icon; middle: "Son koşum" + datetime + status pill; bottom: full-width
 * Kontrol et CTA. Running state is owned by the inner TriggerButton
 * (polling, optimistic UI). Success/error styling is layered via card-level
 * outline glow once the brief's "just finished" state lands in v2.
 */

type Props = {
  supplier: {
    id: string;
    slug: string;
    name: string;
  };
  lastRun: ScrapeRunRow | null;
};

const STATUS_INTENT: Record<ScrapeRunStatus, "info" | "success" | "warning" | "danger" | "neutral"> = {
  running: "info",
  success: "success",
  partial: "warning",
  failed: "danger",
  aborted: "neutral",
};

const STATUS_LABEL: Record<ScrapeRunStatus, string> = {
  running: "Çalışıyor",
  success: "Başarılı",
  partial: "Kısmi",
  failed: "Başarısız",
  aborted: "Durduruldu",
};

export function SupplierTriggerCard({ supplier, lastRun }: Props) {
  return (
    <article className="et-glass relative flex min-h-50 flex-col rounded-[20px] p-5">
      {/* Header: slug + name + truck icon */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            {supplier.slug}
          </div>
          <h3 className="mt-1 text-[18px] font-semibold leading-6 text-slate-900">
            {supplier.name}
          </h3>
        </div>
        <div
          aria-hidden="true"
          className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] bg-slate-900/4 text-slate-600"
        >
          <Icon name="truck" size={20} />
        </div>
      </div>

      {/* Middle: last run datetime + status pill */}
      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <div className="t-cap mb-1">Son koşum</div>
          {lastRun ? (
            <>
              <div className="text-sm font-medium text-slate-900 tnum">
                {formatTrDateTime(lastRun.startedAt)}
              </div>
              <div className="mt-0.5 text-xs text-slate-400">
                {STATUS_LABEL[lastRun.status]}
              </div>
            </>
          ) : (
            <div className="text-sm text-slate-500">Henüz çalıştırılmadı</div>
          )}
        </div>
        {lastRun ? (
          <StatusPill intent={STATUS_INTENT[lastRun.status]}>
            {STATUS_LABEL[lastRun.status]}
          </StatusPill>
        ) : null}
      </div>

      {/* Bottom: trigger button — owns running/optimistic state via polling */}
      <div className="mt-5">
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
      </div>
    </article>
  );
}
