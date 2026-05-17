import Link from "next/link";
import type { ProductSummary } from "@/lib/queries/products";
import { ROUTES } from "@/lib/routes";
import { formatTry } from "@/lib/format/currency";
import { formatTrDate } from "@/lib/format/date";
import { formatTrPercent } from "@/lib/format/percent";

type Props = {
  product: ProductSummary;
};

export function ProductHeaderCard({ product }: Props) {
  return (
    <header className="space-y-3">
      <div className="flex items-center gap-3 text-sm">
        <Link
          href={ROUTES.PRICE_CHANGES}
          className="text-slate-500 hover:text-slate-700 hover:underline"
        >
          ← Zamlananlara dön
        </Link>
        <span className="text-slate-300">·</span>
        <Link
          href={ROUTES.DASHBOARD}
          className="text-slate-500 hover:text-slate-700 hover:underline"
        >
          Dashboard
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {product.name}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
            <span className="font-mono text-xs">{product.code}</span>
            {product.brand ? (
              <>
                <span className="text-slate-300">·</span>
                <span>{product.brand}</span>
              </>
            ) : null}
            <span className="text-slate-300">·</span>
            <span>{product.supplierName}</span>
            <span className="text-slate-300">·</span>
            <span>KDV {formatTrPercent(product.vatRate)}</span>
          </div>
        </div>

        {product.currentUnitPriceWithVat !== null ? (
          <div className="rounded-lg border border-slate-200 bg-white p-3 text-right shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Mevcut (KDV dahil)
            </p>
            <p className="text-xl font-semibold tabular-nums text-slate-900">
              {formatTry(product.currentUnitPriceWithVat)}
            </p>
            {product.currentObservedAt ? (
              <p className="text-xs text-slate-500">
                {formatTrDate(product.currentObservedAt)}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
