"use client";

import { useRouter } from "next/navigation";
import type { OrderTableRow } from "@/lib/queries/orders";
import { ROUTES } from "@/lib/routes";
import { formatTrDate } from "@/lib/format/date";
import { formatTry } from "@/lib/format/currency";

type Props = {
  order: OrderTableRow;
};

export function OrderRow({ order }: Props) {
  const router = useRouter();

  function handleClick() {
    router.push(ROUTES.ORDER_DETAIL(order.id));
  }

  function handleKey(e: React.KeyboardEvent<HTMLTableRowElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      router.push(ROUTES.ORDER_DETAIL(order.id));
    }
  }

  return (
    <tr
      role="link"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKey}
      className="cursor-pointer border-t border-slate-200 transition-colors hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
    >
      <td className="px-4 py-3 font-medium text-slate-900">{order.orderNo}</td>
      <td className="px-4 py-3 text-slate-700">{order.supplierName}</td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
          {order.status}
        </span>
      </td>
      <td className="px-4 py-3 text-slate-600">
        {formatTrDate(order.orderedAt)}
      </td>
      <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-900">
        {formatTry(order.totalAmount)}
      </td>
    </tr>
  );
}
