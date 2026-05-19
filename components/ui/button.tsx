"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

import { Icon, type IconName } from "./icon";

/**
 * Pill button per design brief §3.12. Five kinds:
 * - primary: slate-900 bg, white text
 * - secondary: outline, slate-200 border
 * - tertiary: text + icon only
 * - destructive: rose-600 bg, white text — used in confirmation dialogs
 * - glass: glass surface with hairline border (used on dashboard "Yenile" etc.)
 */

type Kind = "primary" | "secondary" | "tertiary" | "destructive" | "glass";
type Size = "sm" | "md" | "lg";

const KIND_CLASSES: Record<Kind, string> = {
  primary:
    "bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed",
  secondary:
    "bg-transparent text-slate-700 border border-slate-200 hover:bg-slate-50 disabled:opacity-55 disabled:cursor-not-allowed",
  tertiary:
    "bg-transparent text-slate-600 hover:text-slate-900 disabled:opacity-55 disabled:cursor-not-allowed",
  destructive:
    "bg-rose-600 text-white hover:bg-rose-700 disabled:bg-slate-300 disabled:cursor-not-allowed",
  glass:
    "et-glass text-slate-900 hover:bg-white/70 disabled:opacity-55 disabled:cursor-not-allowed",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-11 px-5 text-[15px] gap-2",
};

const ICON_SIZE: Record<Size, number> = {
  sm: 14,
  md: 16,
  lg: 17,
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  kind?: Kind;
  size?: Size;
  iconLeft?: IconName;
  iconRight?: IconName;
  full?: boolean;
  children?: ReactNode;
};

export function Button({
  kind = "primary",
  size = "md",
  iconLeft,
  iconRight,
  full,
  className = "",
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const classes = [
    "inline-flex items-center justify-center rounded-full font-medium whitespace-nowrap transition-colors et-focus",
    SIZE_CLASSES[size],
    KIND_CLASSES[kind],
    full ? "w-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={classes} {...rest}>
      {iconLeft ? <Icon name={iconLeft} size={ICON_SIZE[size]} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={ICON_SIZE[size]} /> : null}
    </button>
  );
}

/**
 * Icon-only circular button (36px default). Two flavors:
 * - glass: floating glass surface (used in top nav)
 * - ghost: transparent (used inline)
 */
type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: IconName;
  size?: number;
  kind?: "glass" | "ghost";
  /** Show a small rose dot indicator (used for unread bell). */
  badge?: boolean;
  /** Required label for screen readers since the button has no text. */
  label: string;
};

export function IconButton({
  icon,
  size = 36,
  kind = "glass",
  badge,
  label,
  className = "",
  type = "button",
  ...rest
}: IconButtonProps) {
  const base =
    "relative inline-flex items-center justify-center rounded-full transition-colors et-focus disabled:opacity-55 disabled:cursor-not-allowed";
  const palette =
    kind === "glass"
      ? "et-glass text-slate-700 hover:bg-white/70"
      : "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900";
  const iconSize = Math.round(size * 0.45);
  return (
    <button
      type={type}
      aria-label={label}
      className={[base, palette, className].join(" ")}
      style={{ width: size, height: size }}
      {...rest}
    >
      <Icon name={icon} size={iconSize} />
      {badge ? (
        <span
          aria-hidden="true"
          className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white"
        />
      ) : null}
    </button>
  );
}
