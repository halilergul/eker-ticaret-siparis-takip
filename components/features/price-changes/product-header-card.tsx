import Link from "next/link";

import { Icon } from "@/components/ui/icon";
import { Monogram } from "@/components/ui/monogram";
import { formatTry } from "@/lib/format/currency";
import { formatTrDate } from "@/lib/format/date";
import { formatTrPercent } from "@/lib/format/percent";
import type { ProductSummary } from "@/lib/queries/products";
import { ROUTES } from "@/lib/routes";

/**
 * Product detail hero per design brief §5.6.
 *
 * Two-column hero: large image (or monogram fallback) left, identity stack
 * right (name, code, brand, supplier, KDV chip). KPI card with the current
 * KDV-inclusive price sits in a glass card below identity.
 */

type Props = {
  product: ProductSummary;
};

export function ProductHeaderCard({ product }: Props) {
  return (
    <header className="space-y-4">
      {/* Breadcrumb back row */}
      <Link
        href={ROUTES.PRICE_CHANGES}
        className="inline-flex items-center gap-1 text-[13px] text-slate-500 hover:text-slate-900 et-focus rounded"
      >
        <Icon name="back" size={14} sw={1.8} />
        Zamlanan Ürünler
      </Link>

      <div className="grid gap-6 sm:grid-cols-[160px_1fr]">
        {/* Hero image / monogram */}
        <div className="aspect-square w-40 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <Monogram name={product.name} size="card" />
        </div>

        {/* Identity */}
        <div className="flex min-w-0 flex-col gap-3">
          <div>
            <div className="t-cap mb-1.5">{product.code}</div>
            <h1 className="t-h1 m-0 text-slate-900">{product.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-slate-600">
              {product.brand ? (
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[12px] font-medium text-slate-700">
                  {product.brand}
                </span>
              ) : null}
              <span className="font-medium text-slate-800">{product.supplierName}</span>
              <span className="text-slate-300">·</span>
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-amber-700">
                KDV {formatTrPercent(product.vatRate)}
              </span>
            </div>
          </div>

          {/* Current price KPI */}
          {product.currentUnitPriceWithVat !== null ? (
            <div className="et-glass rounded-2xl p-5">
              <div className="t-cap mb-1.5">Mevcut fiyat (KDV dahil)</div>
              <div className="text-[40px] leading-11 font-semibold tracking-tight text-slate-900 tnum">
                {formatTry(product.currentUnitPriceWithVat)}
              </div>
              {product.currentObservedAt ? (
                <div className="mt-1 text-xs text-slate-500">
                  Son gözlem · {formatTrDate(product.currentObservedAt)}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
