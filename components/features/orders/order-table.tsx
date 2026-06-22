import type { OrderTableRow } from "@/lib/queries/orders";

import { EmptyState } from "@/components/ui/empty-state";
import { OrderRow } from "./order-row";

/**
 * Orders accordion table per design brief §3.4.
 *
 * Solid white card (text legibility); sticky header on slate-50; rows can
 * expand in place to reveal {@link OrderItemsView}. Multiple rows can be
 * open simultaneously.
 *
 * Empty state (no orders yet) uses the shared {@link EmptyState} with a
 * box icon — see brief §4.3.
 */

type Props = {
  orders: OrderTableRow[];
};

export function OrderTable({ orders }: Props) {
  if (orders.length === 0) {
    return (
      <EmptyState
        icon="box"
        title="Henüz sipariş yok"
        body="İlk yenilemeyi başlat — taradığımız tedarikçi portallarından eşleşen siparişler burada listelenecek."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_rgba(15,23,42,0.05)]">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr className="text-left">
            <th className="w-10 px-5 py-3.5" aria-label="Genişlet" />
            <th className="t-cap px-2 py-3.5">Sipariş No</th>
            <th className="t-cap px-4 py-3.5">Tedarikçi</th>
            <th className="t-cap px-4 py-3.5">Durum</th>
            <th className="t-cap px-4 py-3.5">Tarih</th>
            <th className="t-cap px-5 py-3.5 text-right">Tutar</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <OrderRow key={order.id} order={order} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
