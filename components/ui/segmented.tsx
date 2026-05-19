"use client";

import { Icon, type IconName } from "./icon";

/**
 * Segmented view toggle per design brief §3.6.
 * 28px height, slate-50 container, white active pill with subtle shadow.
 * Used for the OrderItemsView Card/List toggle.
 */

type Option<T extends string> = {
  value: T;
  label: string;
  icon?: IconName;
};

type Props<T extends string> = {
  value: T;
  options: Array<Option<T>>;
  onChange?: (v: T) => void;
  className?: string;
};

export function Segmented<T extends string>({ value, options, onChange, className = "" }: Props<T>) {
  return (
    <div
      role="group"
      className={[
        "inline-flex h-7 p-0.5 rounded-lg bg-slate-100 border border-slate-200",
        className,
      ].join(" ")}
    >
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange?.(o.value)}
            className={[
              "h-[22px] px-2.5 rounded-md text-xs inline-flex items-center gap-1 transition-colors et-focus",
              active
                ? "bg-white text-slate-900 font-medium shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
                : "text-slate-500 hover:text-slate-700",
            ].join(" ")}
          >
            {o.icon ? <Icon name={o.icon} size={12} /> : null}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
