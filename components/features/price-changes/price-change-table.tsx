import type { PriceChangeRow } from "@/lib/queries/price-changes";
import { PriceChangeRowItem } from "./price-change-row";
import { PriceChangesEmptyState } from "./price-changes-empty-state";

type Props = {
  rows: PriceChangeRow[];
  hasAnySnapshot: boolean;
  windowDays: number;
  includeDrops: boolean;
};

export function PriceChangeTable({
  rows,
  hasAnySnapshot,
  windowDays,
  includeDrops,
}: Props) {
  if (rows.length === 0) {
    return (
      <PriceChangesEmptyState
        hasAnySnapshot={hasAnySnapshot}
        windowDays={windowDays}
        includeDrops={includeDrops}
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Ürün Kodu</th>
            <th className="px-4 py-3">Ürün</th>
            <th className="px-4 py-3">Tedarikçi</th>
            <th className="px-4 py-3 text-right">Eski</th>
            <th className="px-4 py-3 text-right">Yeni</th>
            <th className="px-4 py-3 text-right">Δ %</th>
            <th className="px-4 py-3 text-right">Δ ₺</th>
            <th className="px-4 py-3 text-right">Sipariş</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <PriceChangeRowItem key={row.productId} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
