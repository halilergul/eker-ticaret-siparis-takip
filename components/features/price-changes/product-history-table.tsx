import type { ProductSnapshot } from "@/lib/queries/products";
import { formatTrDate } from "@/lib/format/date";
import { formatTry } from "@/lib/format/currency";
import { formatTrPercent } from "@/lib/format/percent";

type Props = {
  snapshots: ProductSnapshot[];
};

export function ProductHistoryTable({ snapshots }: Props) {
  if (snapshots.length === 0) {
    return (
      <section className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
        Bu ürün için henüz catalog snapshot&apos;ı yok.
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Tarih</th>
            <th className="px-4 py-3 text-right">KDV Dahil Fiyat</th>
            <th className="px-4 py-3 text-right">Δ Önceki</th>
            <th className="px-4 py-3 text-right">KDV</th>
            <th className="px-4 py-3 text-right">Liste</th>
            <th className="px-4 py-3">İskonto</th>
          </tr>
        </thead>
        <tbody>
          {snapshots.map((s) => {
            const isUp = (s.changeFromPrevAmount ?? 0) > 0;
            const isDown = (s.changeFromPrevAmount ?? 0) < 0;
            const deltaColor = isUp
              ? "text-rose-700"
              : isDown
                ? "text-emerald-700"
                : "text-slate-500";
            return (
              <tr
                key={s.id}
                className="border-t border-slate-200"
              >
                <td className="px-4 py-3 text-slate-700">
                  {formatTrDate(s.capturedAt)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-900">
                  {formatTry(s.unitPriceWithVat)}
                </td>
                <td
                  className={`px-4 py-3 text-right tabular-nums text-xs ${deltaColor}`}
                >
                  {s.changeFromPrevAmount === null ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    <>
                      <div>
                        {isUp
                          ? `+${formatTry(s.changeFromPrevAmount)}`
                          : isDown
                            ? `−${formatTry(Math.abs(s.changeFromPrevAmount))}`
                            : formatTry(0)}
                      </div>
                      <div className="text-[10px]">
                        {formatTrPercent(s.changeFromPrevPct)}
                      </div>
                    </>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-xs tabular-nums text-slate-600">
                  {s.vatRate !== null ? formatTrPercent(s.vatRate) : "—"}
                </td>
                <td className="px-4 py-3 text-right text-xs tabular-nums text-slate-500">
                  {s.listPrice !== null ? formatTry(s.listPrice) : "—"}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
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
