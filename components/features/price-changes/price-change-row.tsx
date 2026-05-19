import Link from "next/link";

import { Icon } from "@/components/ui/icon";
import { Trend } from "@/components/ui/trend";
import { formatTry } from "@/lib/format/currency";
import type { PriceChangeRow } from "@/lib/queries/price-changes";
import { ROUTES } from "@/lib/routes";

/**
 * Single row in the price-changes table.
 *
 * Δ% uses {@link Trend} (kind="price": up=rose because hike is bad for the
 * merchant, down=emerald). Δ₺ uses matching color + signed format.
 */

type Props = {
  row: PriceChangeRow;
};

export function PriceChangeRowItem({ row }: Props) {
  const isUp = row.changeAmount > 0;
  const isDown = row.changeAmount < 0;
  const deltaColor = isUp
    ? "text-rose-600"
    : isDown
      ? "text-emerald-600"
      : "text-slate-600";
  const signedAmount = isUp
    ? `+${formatTry(row.changeAmount)}`
    : isDown
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
      <td className="px-4 py-3 text-[13px] text-slate-600">{row.supplierSlug}</td>
      <td className="px-4 py-3 text-right text-[13px] text-slate-600 tnum">
        {formatTry(row.oldPrice)}
      </td>
      <td className="px-4 py-3 text-right text-sm font-medium text-slate-900 tnum">
        {formatTry(row.newPrice)}
      </td>
      <td className="px-4 py-3 text-right">
        {row.changePct !== null ? (
          <span className="inline-flex">
            <Trend delta={row.changePct} kind="price" />
          </span>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )}
      </td>
      <td className={`px-4 py-3 text-right text-sm font-medium tnum ${deltaColor}`}>
        {signedAmount}
      </td>
      <td className="px-5 py-3 text-right">
        {row.lastOrderId && row.lastOrderNo ? (
          <Link
            href={ROUTES.ORDER_DETAIL(row.lastOrderId)}
            className="inline-flex items-center gap-1 text-[13px] text-slate-600 hover:text-slate-900 hover:underline"
          >
            {row.lastOrderNo}
            <Icon name="chevR" size={12} />
          </Link>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )}
      </td>
    </tr>
  );
}
