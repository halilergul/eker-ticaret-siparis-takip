"use client";

import { useEffect, useRef, useState } from "react";

import { Icon } from "./icon";

/**
 * Inline filter dropdown — compact glass pill trigger that opens a popover
 * with a list of selectable options. Designed for use inside a horizontal
 * filter bar where space is tight.
 *
 * Single-select. Active state shows the selected option label inside the
 * trigger; clearing is done by selecting "Tümü" (the first option with
 * empty `value`).
 */

export type FilterOption = {
  value: string;
  label: string;
};

type Props = {
  label: string;
  options: FilterOption[];
  value?: string;
  onChange: (v: string) => void;
  /** Disable while a transition is pending (e.g. router.push). */
  disabled?: boolean;
  className?: string;
};

export function FilterDropdown({
  label,
  options,
  value,
  onChange,
  disabled,
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const isActive = Boolean(value);

  return (
    <div ref={wrapRef} className={["relative inline-block", className].join(" ")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={[
          "inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[13px] font-medium transition-colors et-focus disabled:opacity-55 disabled:cursor-not-allowed",
          isActive
            ? "bg-slate-900 text-white border border-slate-900 shadow-[0_2px_6px_rgba(15,23,42,0.18)]"
            : "et-glass text-slate-700 hover:text-slate-900",
        ].join(" ")}
      >
        <span className="text-[11px] font-medium uppercase tracking-wider opacity-70">
          {label}
        </span>
        <span className="truncate max-w-[180px]">{selected?.label ?? "Tümü"}</span>
        <Icon name={open ? "chevU" : "chevD"} size={14} sw={2} />
      </button>
      {open ? (
        <div
          role="listbox"
          className="absolute left-0 top-[calc(100%+8px)] z-40 w-64 et-glass-strong rounded-2xl p-1.5 max-h-72 overflow-auto"
        >
          {options.map((o) => {
            const active = o.value === value;
            return (
              <button
                key={o.value || "__all__"}
                role="option"
                aria-selected={active}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={[
                  "w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors et-focus",
                  active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100",
                ].join(" ")}
              >
                <span className="truncate">{o.label}</span>
                {active ? <Icon name="check" size={14} sw={2.4} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
