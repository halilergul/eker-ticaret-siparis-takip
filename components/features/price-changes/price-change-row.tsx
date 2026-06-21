import Link from "next/link";

import { Trend } from "@/components/ui/trend";
import { formatTry } from "@/lib/format/currency";
import { formatTrDate } from "@/lib/format/date";
import type { PriceComparisonRow } from "@/lib/queries/price-changes";
import { ROUTES } from "@/lib/routes";

/**
 * 012: Son sipariş anındaki birim fiyat (KDV hariç) vs bugünkü tedarikçi
 * fiyatı (KDV hariç). Birikimli zam otomatik kapsanır.
 *
 * Snapshot yoksa "Bugünkü fiyat bilinmiyor" rozeti (US3).
 */

type Props = {
  row: PriceComparisonRow;
};

function pluralizeDays(n: number): string {
  if (n === 0) return "bugün";
  if (n === 1) return "1 gün önce";
  return `${n} gün önce`;
}

export function PriceChangeRowItem({ row }: Props) {
  const snapshotMissing = row.currentPriceExclVat === null;
  const signedAmount =
    row.changeAmount === null
      ? null
      : row.changeAmount > 0
        ? `+${formatTry(row.changeAmount)}`
        : row.changeAmount < 0
          ? `−${formatTry(Math.abs(row.changeAmount))}`
          : formatTry(0);

  return (
    <tr className="group border-t border-slate-100 transition-colors hover:bg-slate-50">
      <td className="px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-slate-500">
        {row.productCode}
      </td>
      <td className="px-4 py-3">
        <Link
          href={ROUTES.PRODUCT_DETAIL(row.productId)}
          className="font-medium text-slate-900 hover:underline"
        >
          {row.productName}
        </Link>
        {row.brand ? (
          <p className="text-xs text-slate-500">{row.brand}</p>
        ) : null}
      </td>
      <td className="px-4 py-3 text-[13px] text-slate-600">{row.supplierName}</td>

      {/* Son alış */}
      <td className="px-4 py-3 text-right tnum">
        <div className="text-sm font-medium text-slate-900">
          {formatTry(row.lastOrderPriceExclVat)}
        </div>
        <div className="text-[11px] text-slate-500">
          {formatTrDate(row.lastOrderedAt)} · {pluralizeDays(row.daysSinceLastOrder)}
        </div>
      </td>

      {/* Bugün */}
      <td className="px-4 py-3 text-right tnum">
        {snapshotMissing ? (
          <span
            className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800"
            title="Tedarikçi catalog'unda olmayabilir, scrape henüz çalışmamış olabilir"
          >
            Bilinmiyor
          </span>
        ) : (
          <>
            <div className="text-sm font-medium text-slate-900">
              {formatTry(row.currentPriceExclVat!)}
            </div>
            {row.currentPriceCapturedAt ? (
              <div className="text-[11px] text-slate-500">
                {formatTrDate(row.currentPriceCapturedAt)}
              </div>
            ) : null}
          </>
        )}
      </td>

      {/* Δ % */}
      <td className="px-4 py-3 text-right">
        {row.changePct !== null ? (
          <span className="inline-flex">
            <Trend delta={row.changePct} kind="price" />
          </span>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )}
      </td>

      {/* Δ TL */}
      <td className="px-5 py-3 text-right text-sm font-medium tnum">
        {signedAmount === null ? (
          <span className="text-xs text-slate-400">—</span>
        ) : (
          <span className={row.changeAmount! > 0 ? "text-rose-600" : "text-slate-600"}>
            {signedAmount}
          </span>
        )}
      </td>
    </tr>
  );
}
