"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Icon } from "@/components/ui/icon";
import { StatusPill } from "@/components/ui/status-pill";
import { OrderItemsView } from "@/components/features/orders/order-items-view";
import { formatTrDate } from "@/lib/format/date";
import { formatTry } from "@/lib/format/currency";
import type { OrderTableRow } from "@/lib/queries/orders";
import { ROUTES } from "@/lib/routes";

/**
 * Single accordion row in the orders table.
 *
 * Two interactions:
 * - Chevron click → toggle in-place item expansion (does NOT navigate)
 * - Anywhere else on the row → navigate to the order detail page
 *
 * Per design brief §3.4: chevron is a 28px circular hit area, rotates 90°
 * on expand. Expanded panel uses a slate-50/60 inset.
 */

type Props = {
  order: OrderTableRow;
};

const STATUS_INTENT: Record<string, "success" | "warning" | "danger" | "info" | "neutral"> = {
  completed: "success",
  // Common Turkish statuses observed in supplier_orders.status
  Tamamland: "success",
  Tamamlandı: "success",
  Onay: "info",
  Onaylandı: "info",
  Bekliyor: "warning",
  Beklemede: "warning",
  Iptal: "danger",
  İptal: "danger",
};

function statusIntent(status: string) {
  return STATUS_INTENT[status] ?? "neutral";
}

export function OrderRow({ order }: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const panelId = `order-items-${order.id}`;

  function navigateToDetail() {
    router.push(ROUTES.ORDER_DETAIL(order.id));
  }

  function handleRowClick(e: React.MouseEvent) {
    // Chevron veya items-panel tıklanmışsa navigasyonu engelle
    if (
      (e.target as HTMLElement).closest(
        "[data-expand-toggle], [data-items-area]",
      )
    ) {
      return;
    }
    navigateToDetail();
  }

  function handleRowKey(e: React.KeyboardEvent) {
    if (
      (e.target as HTMLElement).closest(
        "[data-expand-toggle], [data-items-area]",
      )
    ) {
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
        className={
          "cursor-pointer border-t border-slate-200/80 transition-colors focus:bg-slate-50 focus:outline-none " +
          (expanded ? "bg-slate-50" : "hover:bg-slate-50")
        }
      >
        <td className="px-5 py-3.5">
          <button
            type="button"
            onClick={toggleExpand}
            data-expand-toggle
            aria-label={expanded ? "Ürünleri gizle" : "Ürünleri göster"}
            aria-expanded={expanded}
            aria-controls={panelId}
            className={
              "inline-flex h-7 w-7 items-center justify-center rounded-full transition-all et-focus " +
              (expanded
                ? "bg-slate-900 text-white"
                : "text-slate-400 hover:bg-slate-100 hover:text-slate-700")
            }
          >
            <span
              className={
                "inline-flex transition-transform duration-200 " +
                (expanded ? "rotate-90" : "")
              }
            >
              <Icon name="chevR" size={14} sw={2} />
            </span>
          </button>
        </td>
        <td className="px-2 py-3.5">
          <span className="text-sm font-medium tracking-tight text-slate-900 tnum">
            #{order.orderNo}
          </span>
        </td>
        <td className="px-4 py-3.5 text-[13.5px] text-slate-600">
          {order.supplierName}
        </td>
        <td className="px-4 py-3.5">
          <StatusPill intent={statusIntent(order.status)}>{order.status}</StatusPill>
        </td>
        <td className="px-4 py-3.5 text-[13px] text-slate-600 tnum">
          {formatTrDate(order.orderedAt)}
        </td>
        <td className="px-5 py-3.5 text-right text-sm font-medium text-slate-900 tnum">
          {formatTry(order.totalAmount)}
        </td>
      </tr>
      {expanded ? (
        <tr className="border-t border-slate-200/60 bg-slate-50/60">
          <td colSpan={6} id={panelId} className="px-5 py-5" data-items-area>
            <OrderItemsView items={order.items} />
          </td>
        </tr>
      ) : null}
    </>
  );
}
