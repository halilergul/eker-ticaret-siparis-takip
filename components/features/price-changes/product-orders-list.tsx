import Link from "next/link";
import type { ProductOrderHistoryItem } from "@/lib/queries/products";
import { ROUTES } from "@/lib/routes";
import { formatTrDate } from "@/lib/format/date";
import { formatTry } from "@/lib/format/currency";

type Props = {
  orders: ProductOrderHistoryItem[];
};

export function ProductOrdersList({ orders }: Props) {
  if (orders.length === 0) {
    return (
      <section className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
        Bu ürün henüz sipariş edilmemiş.
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Sipariş No</th>
            <th className="px-4 py-3">Tarih</th>
            <th className="px-4 py-3 text-right">Adet</th>
            <th className="px-4 py-3 text-right">Birim (KDV hariç)</th>
            <th className="px-4 py-3 text-right">Satır Toplamı</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.orderId} className="border-t border-slate-200 hover:bg-slate-50">
              <td className="px-4 py-3">
                <Link
                  href={ROUTES.ORDER_DETAIL(o.orderId)}
                  className="font-medium text-slate-900 hover:underline"
                >
                  {o.orderNo}
                </Link>
              </td>
              <td className="px-4 py-3 text-slate-600">
                {formatTrDate(o.orderedAt)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                {o.quantity}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                {formatTry(o.unitPriceAtOrder)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-900">
                {formatTry(o.lineTotal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
