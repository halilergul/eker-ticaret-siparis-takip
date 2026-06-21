import type { PriceComparisonRow } from "@/lib/queries/price-changes";

import { PriceChangeRowItem } from "./price-change-row";
import { PriceChangesEmptyState } from "./price-changes-empty-state";

type Props = {
  rows: PriceComparisonRow[];
  hasAnySnapshot: boolean;
};

export function PriceChangeTable({ rows, hasAnySnapshot }: Props) {
  if (rows.length === 0) {
    return <PriceChangesEmptyState hasAnySnapshot={hasAnySnapshot} />;
  }

  return (
    <div className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_rgba(15,23,42,0.05)]">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr className="text-left">
            <th className="t-cap px-5 py-3.5">Ürün Kodu</th>
            <th className="t-cap px-4 py-3.5">Ürün</th>
            <th className="t-cap px-4 py-3.5">Tedarikçi</th>
            <th className="t-cap px-4 py-3.5 text-right">Son Alış</th>
            <th className="t-cap px-4 py-3.5 text-right">Bugün</th>
            <th className="t-cap px-4 py-3.5 text-right">Δ %</th>
            <th className="t-cap px-5 py-3.5 text-right">Δ ₺</th>
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
