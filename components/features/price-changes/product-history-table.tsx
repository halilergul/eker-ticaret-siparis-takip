import { EmptyState } from "@/components/ui/empty-state";
import { Trend } from "@/components/ui/trend";
import { formatTrDate } from "@/lib/format/date";
import { formatTry } from "@/lib/format/currency";
import { formatTrPercent } from "@/lib/format/percent";
import type { ProductSnapshot } from "@/lib/queries/products";

type Props = {
  snapshots: ProductSnapshot[];
};

export function ProductHistoryTable({ snapshots }: Props) {
  if (snapshots.length === 0) {
    return (
      <EmptyState
        icon="clock"
        title="Bu ürün için snapshot yok"
        body="Catalog scrape çalıştığında bu ürünün fiyat geçmişi burada görünecek."
      />
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_22px_rgba(15,23,42,0.05)]">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr className="text-left">
            <th className="t-cap px-5 py-3.5">Tarih</th>
            <th className="t-cap px-4 py-3.5 text-right">KDV Dahil Fiyat</th>
            <th className="t-cap px-4 py-3.5 text-right">Δ Önceki</th>
            <th className="t-cap px-4 py-3.5 text-right">KDV</th>
            <th className="t-cap px-4 py-3.5 text-right">Liste</th>
            <th className="t-cap px-5 py-3.5">İskonto</th>
          </tr>
        </thead>
        <tbody>
          {snapshots.map((s) => {
            const isUp = (s.changeFromPrevAmount ?? 0) > 0;
            const isDown = (s.changeFromPrevAmount ?? 0) < 0;
            const deltaColor = isUp
              ? "text-rose-600"
              : isDown
                ? "text-emerald-600"
                : "text-slate-500";
            return (
              <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-5 py-3 text-[13px] text-slate-700 tnum">
                  {formatTrDate(s.capturedAt)}
                </td>
                <td className="px-4 py-3 text-right text-sm font-medium text-slate-900 tnum">
                  {formatTry(s.unitPriceWithVat)}
                </td>
                <td className="px-4 py-3 text-right">
                  {s.changeFromPrevAmount === null ? (
                    <span className="text-xs text-slate-400">—</span>
                  ) : (
                    <div className="flex flex-col items-end gap-0.5">
                      <span className={`text-xs font-medium tnum ${deltaColor}`}>
                        {isUp
                          ? `+${formatTry(s.changeFromPrevAmount)}`
                          : isDown
                            ? `−${formatTry(Math.abs(s.changeFromPrevAmount))}`
                            : formatTry(0)}
                      </span>
                      {s.changeFromPrevPct !== null && Math.abs(s.changeFromPrevPct) > 0.001 ? (
                        <Trend delta={s.changeFromPrevPct} kind="price" decimals={1} />
                      ) : null}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-xs text-slate-600 tnum">
                  {s.vatRate !== null ? formatTrPercent(s.vatRate) : "—"}
                </td>
                <td className="px-4 py-3 text-right text-xs text-slate-500 tnum">
                  {s.listPrice !== null ? formatTry(s.listPrice) : "—"}
                </td>
                <td className="px-5 py-3 text-xs text-slate-500">
                  {s.discountText ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
