"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Chip } from "@/components/ui/chip";
import type { SupplierOption } from "@/lib/queries/orders";
import { ROUTES } from "@/lib/routes";

/**
 * Filter bar per design brief §3.11.
 *
 * Floating glass pill row — each filter rendered as a {@link Chip}. Active
 * chips are slate-900 (solid); inactive chips are glass with slate-600 text.
 * "Temizle" link clears all params.
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

  return (
    <div className="et-glass flex flex-wrap items-center gap-2 rounded-full p-3">
      <span className="px-3 text-[11px] font-medium uppercase tracking-wider text-slate-400">
        Filtrele
      </span>

      <Chip
        active={!currentSupplier}
        onClick={() => setParam("supplier", "")}
        disabled={isPending}
      >
        Tüm tedarikçiler
      </Chip>
      {suppliers.map((s) => (
        <Chip
          key={s.slug}
          active={currentSupplier === s.slug}
          onClick={() => setParam("supplier", s.slug)}
          disabled={isPending}
        >
          {s.name}
        </Chip>
      ))}

      {statuses.length > 0 ? (
        <div className="mx-1.5 h-5 w-px bg-slate-300/50" aria-hidden="true" />
      ) : null}

      {statuses.map((s) => (
        <Chip
          key={s}
          active={currentStatus === s}
          onClick={() => setParam("status", currentStatus === s ? "" : s)}
          disabled={isPending}
        >
          {s}
        </Chip>
      ))}

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
