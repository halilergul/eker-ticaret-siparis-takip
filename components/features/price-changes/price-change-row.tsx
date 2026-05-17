import Link from "next/link";
import type { PriceChangeRow } from "@/lib/queries/price-changes";
import { ROUTES } from "@/lib/routes";
import { formatTry } from "@/lib/format/currency";
import { formatTrPercent } from "@/lib/format/percent";

type Props = {
  row: PriceChangeRow;
};

export function PriceChangeRowItem({ row }: Props) {
  const isUp = row.changeAmount > 0;
  const isDown = row.changeAmount < 0;
  const deltaColor = isUp
    ? "text-rose-700"
    : isDown
      ? "text-emerald-700"
      : "text-slate-600";
  const signedAmount = isUp
    ? `+${formatTry(row.changeAmount)}`
    : isDown
      ? `−${formatTry(Math.abs(row.changeAmount))}`
      : formatTry(0);

  return (
    <tr className="border-t border-slate-200 transition-colors hover:bg-slate-50">
      <td className="px-4 py-3 font-mono text-xs text-slate-700">
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
      <td className="px-4 py-3 text-slate-700">{row.supplierSlug}</td>
      <td className="px-4 py-3 text-right tabular-nums text-slate-700">
        {formatTry(row.oldPrice)}
      </td>
      <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-900">
        {formatTry(row.newPrice)}
      </td>
      <td
        className={`px-4 py-3 text-right tabular-nums font-medium ${deltaColor}`}
      >
        {formatTrPercent(row.changePct)}
      </td>
      <td
        className={`px-4 py-3 text-right tabular-nums font-medium ${deltaColor}`}
      >
        {signedAmount}
      </td>
      <td className="px-4 py-3 text-right">
        {row.lastOrderId && row.lastOrderNo ? (
          <Link
            href={ROUTES.ORDER_DETAIL(row.lastOrderId)}
            className="text-sm text-slate-600 hover:text-slate-900 hover:underline"
          >
            {row.lastOrderNo} →
          </Link>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )}
      </td>
    </tr>
  );
}
