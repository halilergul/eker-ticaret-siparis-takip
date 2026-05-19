"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { FilterDropdown } from "@/components/ui/filter-dropdown";
import type { SupplierOption } from "@/lib/queries/orders";
import { ROUTES } from "@/lib/routes";

/**
 * Filter bar per design brief §3.11 — glass pill row.
 *
 * Original design used chip rows; we switched to compact dropdowns to stop
 * the bar from wrapping into multiple rows once the supplier and status
 * lists grew past 4-5 entries. Active dropdown trigger is slate-900 with
 * the selected option's label inline.
 */

type Props = {
  suppliers: SupplierOption[];
  statuses: string[];
  currentSupplier?: string;
  currentStatus?: string;
};

export function FilterBar({
  suppliers,
  statuses,
  currentSupplier,
  currentStatus,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const hasFilter = Boolean(currentSupplier || currentStatus);

  function setParam(key: "supplier" | "status", value: string) {
    const sp = new URLSearchParams(searchParams.toString());
    if (value) sp.set(key, value);
    else sp.delete(key);
    const qs = sp.toString();
    const target = qs ? `${ROUTES.DASHBOARD}?${qs}` : ROUTES.DASHBOARD;
    startTransition(() => {
      router.push(target);
    });
  }

  function clearAll() {
    startTransition(() => {
      router.push(ROUTES.DASHBOARD);
    });
  }

  const supplierOptions = [
    { value: "", label: "Tüm tedarikçiler" },
    ...suppliers.map((s) => ({ value: s.slug, label: s.name })),
  ];
  const statusOptions = [
    { value: "", label: "Tüm durumlar" },
    ...statuses.map((s) => ({ value: s, label: s })),
  ];

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

      {statuses.length > 0 ? (
        <FilterDropdown
          label="Durum"
          options={statusOptions}
          value={currentStatus}
          onChange={(v) => setParam("status", v)}
          disabled={isPending}
        />
      ) : null}

      <div className="flex-1" />

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
