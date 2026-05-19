"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

import { Icon, type IconName } from "./icon";

/**
 * Filter chip / pill toggle per design brief §3.11.
 * Active = slate-900 bg + white text. Inactive = glass + slate-600.
 */

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  icon?: IconName;
  children: ReactNode;
};

export function Chip({ active, icon, children, className = "", type = "button", ...rest }: Props) {
  const base =
    "inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[13px] font-medium transition-colors et-focus disabled:opacity-55 disabled:cursor-not-allowed";
  const palette = active
    ? "bg-slate-900 text-white border border-slate-900 shadow-[0_2px_6px_rgba(15,23,42,0.18)]"
    : "et-glass text-slate-600 hover:text-slate-900";
  return (
    <button type={type} className={[base, palette, className].join(" ")} {...rest}>
      {icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </button>
  );
}
