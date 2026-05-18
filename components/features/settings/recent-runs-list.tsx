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

const STATUS_CLASS: Record<ScrapeRunRow["status"], string> = {
  running: "bg-sky-100 text-sky-800",
  success: "bg-emerald-100 text-emerald-800",
  partial: "bg-amber-100 text-amber-800",
  failed: "bg-rose-100 text-rose-800",
  aborted: "bg-stone-200 text-stone-800",
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
      <div className="rounded-md border border-dashed border-stone-300 bg-stone-50 p-4 text-sm text-stone-600">
        Henüz scrape yapılmadı — başlatmak için &quot;Kontrol et&quot;e basın.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-stone-200">
      <table className="min-w-full divide-y divide-stone-200 text-sm">
        <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
          <tr>
            <th className="px-3 py-2 font-medium">Tarih / Saat</th>
            <th className="px-3 py-2 font-medium">Tip</th>
            <th className="px-3 py-2 font-medium">Durum</th>
            <th className="px-3 py-2 font-medium">Özet</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100 bg-white">
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
    <tr>
      <td className="whitespace-nowrap px-3 py-2 text-stone-700">
        {formatTrDateTime(run.startedAt)}
      </td>
      <td className="px-3 py-2 text-stone-600">{TRIGGER_LABEL[run.triggerType]}</td>
      <td className="px-3 py-2">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[run.status]}`}
        >
          {STATUS_LABEL[run.status]}
        </span>
      </td>
      <td className="px-3 py-2 text-stone-600">
        <RunSummary run={run} />
        <RunErrorDetails errors={run.errorDetails} />
      </td>
    </tr>
  );
}

function formatCount(
  label: string,
  inserted: number,
  skipped: number,
): string | null {
  if (inserted === 0 && skipped === 0) return null;
  if (skipped === 0) return `${inserted} ${label}`;
  if (inserted === 0) return `0 yeni · ${skipped} mevcut ${label}`;
  return `${inserted} yeni · ${skipped} mevcut ${label}`;
}

function RunSummary({ run }: { run: ScrapeRunRow }) {
  if (run.status === "running") {
    return <span className="text-stone-500">Devam ediyor…</span>;
  }
  const parts: string[] = [];
  const orderText = formatCount(
    "sipariş",
    run.ordersInserted,
    run.ordersSkipped,
  );
  const itemText = formatCount("satır", run.itemsInserted, run.itemsSkipped);
  if (orderText) parts.push(orderText);
  if (itemText) parts.push(itemText);
  if (run.snapshotsAdded > 0) parts.push(`${run.snapshotsAdded} snapshot`);
  if (run.errorsCount > 0) parts.push(`${run.errorsCount} hata`);
  if (parts.length === 0) return <span className="text-stone-400">—</span>;
  return <span>{parts.join(" · ")}</span>;
}
