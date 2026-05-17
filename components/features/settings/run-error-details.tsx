"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { formatTrDateTime } from "@/lib/format/date";
import type { ScrapeRunRow } from "@/lib/queries/scrape-runs";

type Props = {
  errors: ScrapeRunRow["errorDetails"];
};

export function RunErrorDetails({ errors }: Props) {
  const [open, setOpen] = useState(false);

  if (errors.length === 0) return null;

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-1 text-xs font-medium text-stone-600 hover:text-stone-900"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        )}
        {open ? "Hata detayını gizle" : `Hata detayını göster (${errors.length})`}
      </button>
      {open ? (
        <ul className="mt-2 space-y-1 rounded-md border border-stone-200 bg-stone-50 p-3 text-xs text-stone-700">
          {errors.map((err, idx) => (
            <li key={`${err.timestamp}-${idx}`} className="flex flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded bg-stone-200 px-1.5 py-0.5 font-mono">
                  {err.step}
                </span>
                <span className="rounded bg-rose-100 px-1.5 py-0.5 text-rose-800">
                  {err.mode}
                </span>
                <span className="text-stone-500">
                  {err.timestamp ? formatTrDateTime(err.timestamp) : ""}
                </span>
              </div>
              {err.detail ? (
                <p className="break-words text-stone-600">{err.detail}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
