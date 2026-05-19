"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { FilterDropdown } from "@/components/ui/filter-dropdown";
import { DAYS_PRESETS } from "@/lib/constants/price-changes";
import { ROUTES } from "@/lib/routes";

type Props = {
  currentDays: number;
  currentShowDrops: boolean;
};

export function WindowFilter({ currentDays, currentShowDrops }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function navigateWith(updates: { days?: number; showDrops?: boolean }) {
    const sp = new URLSearchParams(searchParams.toString());
    if (updates.days !== undefined) {
      sp.set("days", String(updates.days));
    }
    if (updates.showDrops !== undefined) {
      if (updates.showDrops) sp.set("showDrops", "1");
      else sp.delete("showDrops");
    }
    const qs = sp.toString();
    startTransition(() => {
      router.push(qs ? `${ROUTES.PRICE_CHANGES}?${qs}` : ROUTES.PRICE_CHANGES);
    });
  }

  const dayOptions = DAYS_PRESETS.map((d) => ({
    value: String(d),
    label: `Son ${d} gün`,
  }));

  return (
    <div className="et-glass flex flex-wrap items-center gap-3 rounded-full p-2.5 pl-4">
      <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
        Filtrele
      </span>

      <FilterDropdown
        label="Pencere"
        options={dayOptions}
        value={String(currentDays)}
        onChange={(v) => navigateWith({ days: Number(v) })}
        disabled={isPending}
      />

      <label className="inline-flex cursor-pointer items-center gap-2 px-2 text-[13px] text-slate-700">
        <input
          type="checkbox"
          checked={currentShowDrops}
          onChange={(e) => navigateWith({ showDrops: e.target.checked })}
          disabled={isPending}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className="relative inline-block h-5 w-9 rounded-full bg-slate-200 transition-colors peer-checked:bg-slate-900"
        >
          <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
        </span>
        Fiyat düşüşlerini de göster
      </label>
    </div>
  );
}
