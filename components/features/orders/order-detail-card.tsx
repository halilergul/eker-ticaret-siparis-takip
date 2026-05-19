import Link from "next/link";

import { Icon } from "@/components/ui/icon";
import { Notice } from "@/components/ui/notice";
import { StatusPill } from "@/components/ui/status-pill";
import { OrderItemsView } from "@/components/features/orders/order-items-view";
import { formatTrDate, formatTrDateTime } from "@/lib/format/date";
import { formatTry } from "@/lib/format/currency";
import type { OrderDetail } from "@/lib/queries/orders";
import { ROUTES } from "@/lib/routes";

/**
 * Order detail screen per design brief §5.2.
 *
 * Two-column desktop layout:
 * - Left (lg:2/3): OrderItemsView (Card view default)
 * - Right (lg:1/3): glass info card stack — supplier · dates · totals
 *
 * Mobile collapses to single column. Back link sits above H1.
 */

type Props = {
  detail: OrderDetail;
};

const STATUS_INTENT: Record<string, "success" | "warning" | "danger" | "info" | "neutral"> = {
  completed: "success",
  Tamamlandı: "success",
  Tamamland: "success",
  Onaylandı: "info",
  Onay: "info",
  Bekliyor: "warning",
  Beklemede: "warning",
  İptal: "danger",
  Iptal: "danger",
};

export function OrderDetailCard({ detail }: Props) {
  // KDV ara hesabı — `computedTotal` = Σ (qty × unit_price_at_order, KDV hariç).
  // `totalAmount` = supplier total (KDV dahil). Diff = KDV + yuvarlama farkı.
  const vatAmount = Number((detail.totalAmount - detail.computedTotal).toFixed(2));
  const vatRatePct =
    detail.computedTotal > 0
      ? Math.round((vatAmount / detail.computedTotal) * 100)
      : null;
  const hasAnomaly = vatAmount < -0.05;

  const itemsPreview = detail.items.map((it) => ({
    id: it.id,
    productId: it.productId,
    productCode: it.productCode,
    productName: it.productName,
    quantity: it.quantity,
    unitPriceAtOrder: it.unitPriceAtOrder,
    imageUrl: it.imageUrl,
  }));

  return (
    <article className="space-y-6">
      {/* Back link */}
      <Link
        href={ROUTES.DASHBOARD}
        className="inline-flex items-center gap-1 text-[13px] text-slate-500 hover:text-slate-900 et-focus rounded"
      >
        <Icon name="back" size={14} sw={1.8} />
        Tüm siparişler
      </Link>

      {/* Header: title + supplier + status */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="t-h1 m-0 text-slate-900">Sipariş #{detail.orderNo}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-slate-600">
            <span className="font-medium text-slate-800">{detail.supplierName}</span>
            <span className="text-slate-300">·</span>
            <span className="tnum">{formatTrDateTime(detail.orderedAt)}</span>
          </div>
        </div>
        <StatusPill intent={STATUS_INTENT[detail.status] ?? "neutral"}>
          {detail.status}
        </StatusPill>
      </header>

      {detail.notes ? (
        <Notice intent="info" title="Sipariş notu" body={detail.notes} />
      ) : null}

      {/* Two-column main */}
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        {/* Left: items */}
        <section>
          <OrderItemsView items={itemsPreview} initialView="card" />
        </section>

        {/* Right: info cards stack */}
        <aside className="space-y-4">
          {/* Supplier card */}
          <div className="et-glass rounded-2xl p-5">
            <div className="t-cap mb-3">Tedarikçi</div>
            <div className="text-base font-medium text-slate-900">
              {detail.supplierName}
            </div>
            <div className="mt-0.5 text-[12px] text-slate-400 uppercase tracking-wider">
              {detail.supplierSlug}
            </div>
          </div>

          {/* Order meta card */}
          <div className="et-glass rounded-2xl p-5">
            <div className="t-cap mb-3">Sipariş Bilgileri</div>
            <dl className="space-y-2 text-[13px]">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Sipariş No</dt>
                <dd className="font-medium text-slate-900 tnum">#{detail.orderNo}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Tarih</dt>
                <dd className="font-medium text-slate-900 tnum">
                  {formatTrDate(detail.orderedAt)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Durum</dt>
                <dd>
                  <StatusPill intent={STATUS_INTENT[detail.status] ?? "neutral"}>
                    {detail.status}
                  </StatusPill>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Para birimi</dt>
                <dd className="font-medium text-slate-900">{detail.currency}</dd>
              </div>
            </dl>
          </div>

          {/* Totals card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_22px_rgba(15,23,42,0.05)]">
            <div className="t-cap mb-3">Toplam</div>
            <dl className="space-y-2 text-[13px]">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-slate-500">Ara toplam (KDV hariç)</dt>
                <dd className="tnum text-slate-900">
                  {formatTry(detail.computedTotal)}
                </dd>
              </div>
              {vatRatePct !== null && vatAmount > 0.05 ? (
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-slate-500">KDV (%{vatRatePct})</dt>
                  <dd className="tnum text-slate-900">{formatTry(vatAmount)}</dd>
                </div>
              ) : null}
              <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-slate-200 pt-2.5">
                <dt className="font-medium text-slate-900">
                  Toplam (KDV dahil)
                </dt>
                <dd className="t-h3 font-semibold text-slate-900 tnum">
                  {formatTry(detail.totalAmount)}
                </dd>
              </div>
            </dl>
            {hasAnomaly ? (
              <div className="mt-3">
                <Notice
                  intent="warning"
                  title="Veri tutarsız"
                  body="Sipariş toplamı, ürün ara toplamının altında. Scraper verisi eksik veya hatalı olabilir."
                />
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </article>
  );
}
