import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { RunErrorDetails } from "@/components/features/settings/run-error-details";
import { formatTrDateTime } from "@/lib/format/date";
import { listRecentRuns, type ScrapeRunRow } from "@/lib/queries/scrape-runs";

type Props = {
  supplierId: string;
};

const STATUS_LABEL: Record<ScrapeRunRow["status"], string> = {
  running: "Çalışıyor",
  success: "Başarılı",
  partial: "Kısmi",
  failed: "Başarısız",
  aborted: "Durduruldu",
};

const STATUS_INTENT: Record<ScrapeRunRow["status"], "info" | "success" | "warning" | "danger" | "neutral"> = {
  running: "info",
  success: "success",
  partial: "warning",
  failed: "danger",
  aborted: "neutral",
};

const TRIGGER_LABEL: Record<ScrapeRunRow["triggerType"], string> = {
  auto: "Otomatik",
  manual: "Manuel",
  unknown: "—",
};

export async function RecentRunsList({ supplierId }: Props) {
  const runs = await listRecentRuns(supplierId, 10);

  if (runs.length === 0) {
    return (
      <EmptyState
        icon="clock"
        title="Henüz yenileme geçmişi yok"
        body="Başlatmak için 'Kontrol et'e basın."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr className="text-left">
            <th className="t-cap px-4 py-3">Tarih / Saat</th>
            <th className="t-cap px-4 py-3">Tip</th>
            <th className="t-cap px-4 py-3">Durum</th>
            <th className="t-cap px-4 py-3">Özet</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <RunRow key={run.id} run={run} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RunRow({ run }: { run: ScrapeRunRow }) {
  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50">
      <td className="whitespace-nowrap px-4 py-2.5 text-[13px] text-slate-700 tnum">
        {formatTrDateTime(run.startedAt)}
      </td>
      <td className="px-4 py-2.5 text-[13px] text-slate-600">
        {TRIGGER_LABEL[run.triggerType]}
      </td>
      <td className="px-4 py-2.5">
        <StatusPill intent={STATUS_INTENT[run.status]}>{STATUS_LABEL[run.status]}</StatusPill>
      </td>
      <td className="px-4 py-2.5 text-[13px] text-slate-600">
        <RunSummary run={run} />
        <RunErrorDetails errors={run.errorDetails} />
      </td>
    </tr>
  );
}

function formatCount(label: string, inserted: number, skipped: number): string | null {
  if (inserted === 0 && skipped === 0) return null;
  if (skipped === 0) return `${inserted} ${label}`;
  if (inserted === 0) return `0 yeni · ${skipped} mevcut ${label}`;
  return `${inserted} yeni · ${skipped} mevcut ${label}`;
}

function RunSummary({ run }: { run: ScrapeRunRow }) {
  if (run.status === "running") {
    return <span className="text-slate-500">Devam ediyor…</span>;
  }
  const parts: string[] = [];
  const orderText = formatCount("sipariş", run.ordersInserted, run.ordersSkipped);
  const itemText = formatCount("satır", run.itemsInserted, run.itemsSkipped);
  if (orderText) parts.push(orderText);
  if (itemText) parts.push(itemText);
  if (run.snapshotsAdded > 0) parts.push(`${run.snapshotsAdded} snapshot`);
  // 015: etkili hata + devre dışı hata ayrımı
  if (run.effectiveErrors > 0) parts.push(`${run.effectiveErrors} hata`);
  if (run.staleErrors > 0) parts.push(`${run.staleErrors} devre dışı`);
  if (run.newlyDisabled > 0) parts.push(`${run.newlyDisabled} yeni devre dışı`);
  if (parts.length === 0) return <span className="text-slate-400">—</span>;
  return <span className="tnum">{parts.join(" · ")}</span>;
}
