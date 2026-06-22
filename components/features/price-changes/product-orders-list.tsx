import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { formatTry } from "@/lib/format/currency";
import { formatTrDate } from "@/lib/format/date";
import type { ProductOrderHistoryItem } from "@/lib/queries/products";
import { ROUTES } from "@/lib/routes";

type Props = {
  orders: ProductOrderHistoryItem[];
};

export function ProductOrdersList({ orders }: Props) {
  if (orders.length === 0) {
    return (
      <EmptyState
        icon="box"
        title="Bu ürün henüz sipariş edilmemiş"
        body="Sipariş yenilemeleri tamamlandıkça bu ürünü içeren siparişler burada listelenir."
      />
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_22px_rgba(15,23,42,0.05)]">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr className="text-left">
            <th className="t-cap px-5 py-3.5">Sipariş No</th>
            <th className="t-cap px-4 py-3.5">Tarih</th>
            <th className="t-cap px-4 py-3.5 text-right">Adet</th>
            <th className="t-cap px-4 py-3.5 text-right">Birim (KDV hariç)</th>
            <th className="t-cap px-5 py-3.5 text-right">Satır Toplamı</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.orderId} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="px-5 py-3">
                <Link
                  href={ROUTES.ORDER_DETAIL(o.orderId)}
                  className="inline-flex items-center gap-1 text-sm font-medium text-slate-900 hover:underline tnum"
                >
                  #{o.orderNo}
                  <Icon name="chevR" size={12} />
                </Link>
              </td>
              <td className="px-4 py-3 text-[13px] text-slate-600 tnum">
                {formatTrDate(o.orderedAt)}
              </td>
              <td className="px-4 py-3 text-right text-[13px] text-slate-700 tnum">
                {o.quantity}
              </td>
              <td className="px-4 py-3 text-right text-[13px] text-slate-700 tnum">
                {formatTry(o.unitPriceAtOrder)}
              </td>
              <td className="px-5 py-3 text-right text-sm font-medium text-slate-900 tnum">
                {formatTry(o.lineTotal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
