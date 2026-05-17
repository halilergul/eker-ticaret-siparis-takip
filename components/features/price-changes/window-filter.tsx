"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
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

  function navigateWith(updates: { days?: number | null; showDrops?: boolean }) {
    const sp = new URLSearchParams(searchParams.toString());
    if (updates.days === null) {
      sp.delete("days");
    } else if (updates.days !== undefined) {
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

  const isCustomDays = !DAYS_PRESETS.includes(currentDays as 7 | 14 | 30 | 90);

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-1">
        <label
          htmlFor="window-days"
          className="text-xs font-medium text-slate-600"
        >
          Pencere
        </label>
        <select
          id="window-days"
          value={isCustomDays ? "custom" : String(currentDays)}
          onChange={(e) => {
            if (e.target.value === "custom") return;
            navigateWith({ days: Number(e.target.value) });
          }}
          disabled={isPending}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none disabled:opacity-60"
        >
          {DAYS_PRESETS.map((d) => (
            <option key={d} value={d}>
              Son {d} gün
            </option>
          ))}
          {isCustomDays ? (
            <option value="custom">Son {currentDays} gün (özel)</option>
          ) : null}
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={currentShowDrops}
          onChange={(e) => navigateWith({ showDrops: e.target.checked })}
          disabled={isPending}
          className="h-4 w-4 rounded border-slate-300"
        />
        Fiyat düşüşlerini de göster
      </label>
    </div>
  );
}
