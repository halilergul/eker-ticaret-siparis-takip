"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import type { SupplierOption } from "@/lib/queries/orders";
import { ROUTES } from "@/lib/routes";

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

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-1">
        <label
          htmlFor="filter-supplier"
          className="text-xs font-medium text-slate-600"
        >
          Tedarikçi
        </label>
        <select
          id="filter-supplier"
          value={currentSupplier ?? ""}
          onChange={(e) => setParam("supplier", e.target.value)}
          disabled={isPending}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none disabled:opacity-60"
        >
          <option value="">Tüm tedarikçiler</option>
          {suppliers.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="filter-status"
          className="text-xs font-medium text-slate-600"
        >
          Durum
        </label>
        <select
          id="filter-status"
          value={currentStatus ?? ""}
          onChange={(e) => setParam("status", e.target.value)}
          disabled={isPending}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none disabled:opacity-60"
        >
          <option value="">Tüm durumlar</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {hasFilter ? (
        <Link
          href={ROUTES.DASHBOARD}
          className="ml-auto text-sm text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
        >
          Filtreleri temizle
        </Link>
      ) : null}
    </div>
  );
}
