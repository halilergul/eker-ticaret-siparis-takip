import type { OrderTableRow } from "@/lib/queries/orders";
import { EmptyState } from "./empty-state";
import { OrderRow } from "./order-row";

type Props = {
  orders: OrderTableRow[];
};

export function OrderTable({ orders }: Props) {
  if (orders.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Sipariş No</th>
            <th className="px-4 py-3">Tedarikçi</th>
            <th className="px-4 py-3">Durum</th>
            <th className="px-4 py-3">Tarih</th>
            <th className="px-4 py-3 text-right">Tutar</th>
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
