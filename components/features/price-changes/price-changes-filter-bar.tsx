"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { FilterDropdown } from "@/components/ui/filter-dropdown";
import type { SupplierOption } from "@/lib/queries/orders";
import { ROUTES } from "@/lib/routes";
import { MIN_CHANGE_PRESETS, SORT_OPTIONS, type SortOption } from "@/lib/constants/price-changes";

/**
 * 012: Pencere kavramı kaldırıldı. Yerine tedarikçi + min zam % + sıralama.
 */

type Props = {
  suppliers: SupplierOption[];
  currentSupplier?: string;
  currentMinPct: number; // 0..1 ratio
  currentSort: SortOption;
};

const SORT_LABELS: Record<SortOption, string> = {
  last_ordered_desc: "En yeni sipariş ↓",
  last_ordered_asc: "En eski sipariş ↑",
  change_pct: "Zam % ↓",
  change_amount: "Zam TL ↓",
  days_since: "Stok yaşı ↓",
};

const MIN_PCT_LABELS: Record<number, string> = {
  0: "Tümü",
  0.05: "%5+",
  0.10: "%10+",
  0.25: "%25+",
  0.50: "%50+",
};

export function PriceChangesFilterBar({
  suppliers,
  currentSupplier,
  currentMinPct,
  currentSort,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function setParam(key: "supplier" | "min" | "sort", value: string) {
    const sp = new URLSearchParams(searchParams.toString());
    if (value) sp.set(key, value);
    else sp.delete(key);
    sp.delete("page"); // filtre değişince ilk sayfaya dön
    const qs = sp.toString();
    startTransition(() => {
      router.push(qs ? `${ROUTES.PRICE_CHANGES}?${qs}` : ROUTES.PRICE_CHANGES);
    });
  }

  function clearAll() {
    startTransition(() => {
      router.push(ROUTES.PRICE_CHANGES);
    });
  }

  const supplierOptions = [
    { value: "", label: "Tüm tedarikçiler" },
    ...suppliers.map((s) => ({ value: s.slug, label: s.name })),
  ];

  const sortOptions = SORT_OPTIONS.map((s) => ({ value: s, label: SORT_LABELS[s] }));

  const hasFilter = Boolean(currentSupplier || currentMinPct > 0 || currentSort !== "last_ordered_desc");

  return (
    <div className="et-glass flex flex-wrap items-center gap-2.5 rounded-full p-2.5 pl-4">
      <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
        Filtrele
      </span>

      <FilterDropdown
        label="Tedarikçi"
        options={supplierOptions}
        value={currentSupplier}
        onChange={(v) => setParam("supplier", v)}
        disabled={isPending}
      />

      <div className="flex items-center gap-1.5">
        <span className="text-[11px] uppercase tracking-wider text-slate-400">Min zam</span>
        {MIN_CHANGE_PRESETS.map((p) => {
          const pctInt = Math.round(p * 100);
          const label = MIN_PCT_LABELS[p];
          const active = Math.abs(currentMinPct - p) < 0.001;
          const handleClick = () => setParam("min", pctInt === 0 ? "" : String(pctInt));
          return (
            <button
              key={p}
              type="button"
              onClick={handleClick}
              disabled={isPending}
              className={
                active
                  ? "inline-flex items-center rounded-full bg-slate-900 px-2.5 py-1 text-[12px] font-medium text-white et-focus"
                  : "inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[12px] font-medium text-slate-600 hover:bg-slate-200 et-focus"
              }
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="flex-1" />

      <FilterDropdown
        label="Sırala"
        options={sortOptions}
        value={currentSort}
        onChange={(v) => setParam("sort", v === "last_ordered_desc" ? "" : v)}
        disabled={isPending}
      />

      {hasFilter ? (
        <button
          type="button"
          onClick={clearAll}
          disabled={isPending}
          className="px-3 text-[13px] text-slate-600 underline underline-offset-[3px] hover:text-slate-900 et-focus rounded disabled:opacity-60"
        >
          Temizle
        </button>
      ) : null}
    </div>
  );
}
