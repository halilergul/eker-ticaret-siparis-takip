import type { PriceChangeRow } from "@/lib/queries/price-changes";

import { PriceChangeRowItem } from "./price-change-row";
import { PriceChangesEmptyState } from "./price-changes-empty-state";

/**
 * Price-changes table per design brief §5.3.
 *
 * Solid white card (number legibility). Sticky header, slate-50 hover rows,
 * tabular nums right-aligned. Trend indicator (colored ▲/▼ + delta %) sits
 * in the Δ% column per §4.9.
 */

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
    <div className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_rgba(15,23,42,0.05)]">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr className="text-left">
            <th className="t-cap px-5 py-3.5">Ürün Kodu</th>
            <th className="t-cap px-4 py-3.5">Ürün</th>
            <th className="t-cap px-4 py-3.5">Tedarikçi</th>
            <th className="t-cap px-4 py-3.5 text-right">Eski</th>
            <th className="t-cap px-4 py-3.5 text-right">Yeni</th>
            <th className="t-cap px-4 py-3.5 text-right">Δ %</th>
            <th className="t-cap px-4 py-3.5 text-right">Δ ₺</th>
            <th className="t-cap px-5 py-3.5 text-right">Sipariş</th>
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
