import Link from "next/link";
import type { OrderDetail } from "@/lib/queries/orders";
import { ROUTES } from "@/lib/routes";
import { formatTrDate } from "@/lib/format/date";
import { formatTry } from "@/lib/format/currency";

type Props = {
  detail: OrderDetail;
};

export function OrderDetailCard({ detail }: Props) {
  // `computedTotal` KDV hariç ürün ara toplamı (= Σ unit_price_at_order × qty).
  // `totalAmount` KDV dahil sipariş toplamı. Fark KDV+kuruş yuvarlamasından gelir.
  // KDV oranını yüzde olarak türet (örn. 20). Enderyapı %20 sabit; ileride
  // ürün başına `vat_rate` eklendiğinde bu hesap genelleştirilir.
  const vatAmount = Number((detail.totalAmount - detail.computedTotal).toFixed(2));
  const vatRatePct =
    detail.computedTotal > 0
      ? Math.round((vatAmount / detail.computedTotal) * 100)
      : null;

  // Gerçek anomali: DB toplamı net hesabın altında — KDV açıklayamaz, veri hatası.
  const hasAnomaly = vatAmount < -0.05;

  return (
    <article className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Link
            href={ROUTES.DASHBOARD}
            className="text-sm text-slate-500 hover:text-slate-700 hover:underline"
          >
            ← Sipariş listesine dön
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Sipariş {detail.orderNo}
          </h1>
          <p className="text-sm text-slate-600">
            {detail.supplierName} · {formatTrDate(detail.orderedAt)}
          </p>
        </div>
        <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
          {detail.status}
        </span>
      </div>

      {detail.notes ? (
        <section className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <strong className="font-medium text-slate-900">Not:</strong>{" "}
          {detail.notes}
        </section>
      ) : null}

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Ürün Kodu</th>
              <th className="px-4 py-3">Ürün Adı</th>
              <th className="px-4 py-3 text-right">Adet</th>
              <th className="px-4 py-3 text-right">Birim Fiyat</th>
              <th className="px-4 py-3 text-right">Satır Toplamı</th>
            </tr>
          </thead>
          <tbody>
            {detail.items.length === 0 ? (
              <tr className="border-t border-slate-200">
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-sm text-slate-500"
                >
                  Bu sipariş için ürün satırı yok.
                </td>
              </tr>
            ) : (
              detail.items.map((item) => (
                <tr key={item.id} className="border-t border-slate-200">
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">
                    {item.productCode}
                  </td>
                  <td className="px-4 py-3 text-slate-900">
                    {item.productName}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                    {item.quantity}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                    {formatTry(item.unitPriceAtOrder)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-900">
                    {formatTry(item.lineTotal)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <dl className="ml-auto max-w-sm space-y-1.5 text-sm">
          <div className="flex items-baseline justify-between gap-6">
            <dt className="text-slate-500">Ürün ara toplam (KDV hariç):</dt>
            <dd className="tabular-nums text-slate-900">
              {formatTry(detail.computedTotal)}
            </dd>
          </div>
          {vatRatePct !== null && vatAmount > 0.05 ? (
            <div className="flex items-baseline justify-between gap-6">
              <dt className="text-slate-500">KDV (%{vatRatePct}):</dt>
              <dd className="tabular-nums text-slate-900">
                {formatTry(vatAmount)}
              </dd>
            </div>
          ) : null}
          <div className="flex items-baseline justify-between gap-6 border-t border-slate-200 pt-1.5">
            <dt className="font-medium text-slate-900">
              Sipariş toplamı (KDV dahil):
            </dt>
            <dd className="font-semibold tabular-nums text-slate-900">
              {formatTry(detail.totalAmount)}
            </dd>
          </div>
        </dl>
        {hasAnomaly ? (
          <p className="mt-3 inline-flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
            ⚠ Veri tutarsız — sipariş toplamı, ürün ara toplamının altında. Scraper verisi eksik veya hatalı olabilir.
          </p>
        ) : null}
      </section>
    </article>
  );
}
