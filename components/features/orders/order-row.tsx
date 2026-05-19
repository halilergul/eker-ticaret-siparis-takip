"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { OrderTableRow } from "@/lib/queries/orders";
import { ROUTES } from "@/lib/routes";
import { formatTrDate } from "@/lib/format/date";
import { formatTry } from "@/lib/format/currency";
import { OrderItemsView } from "@/components/features/orders/order-items-view";

type Props = {
  order: OrderTableRow;
};

export function OrderRow({ order }: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);

  function navigateToDetail() {
    router.push(ROUTES.ORDER_DETAIL(order.id));
  }

  function handleRowClick(e: React.MouseEvent) {
    // Chevron veya item-area tıklanmışsa navigasyonu engelle
    if ((e.target as HTMLElement).closest("[data-expand-toggle], [data-items-area]")) {
      return;
    }
    navigateToDetail();
  }

  function handleRowKey(e: React.KeyboardEvent) {
    if ((e.target as HTMLElement).closest("[data-expand-toggle], [data-items-area]")) {
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      navigateToDetail();
    }
  }

  function toggleExpand(e: React.MouseEvent) {
    e.stopPropagation();
    setExpanded((v) => !v);
  }

  return (
    <>
      <tr
        role="link"
        tabIndex={0}
        onClick={handleRowClick}
        onKeyDown={handleRowKey}
        aria-expanded={expanded}
        className="cursor-pointer border-t border-slate-200 transition-colors hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleExpand}
              data-expand-toggle
              aria-label={expanded ? "Ürünleri gizle" : "Ürünleri göster"}
              aria-expanded={expanded}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              <svg
                className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
            <span className="font-medium text-slate-900">{order.orderNo}</span>
          </div>
        </td>
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
      {expanded ? (
        <tr className="border-t border-slate-100 bg-slate-50/60">
          <td colSpan={5} className="px-4 py-4" data-items-area>
            <OrderItemsView items={order.items} />
          </td>
        </tr>
      ) : null}
    </>
  );
}
