/**
 * Semantic palette tokens — used by StatusPill, Notice, Toast, Trend, etc.
 * Mirrors design brief §2.1 "Semantic palette" table.
 *
 * Use these instead of hard-coded Tailwind classes so that swapping intents
 * across components stays consistent.
 */

export type Intent = "success" | "warning" | "danger" | "info" | "neutral";

export const INTENT_HEX: Record<Intent, { text: string; soft: string; bold: string }> = {
  success: { text: "#059669", soft: "#D1FAE5", bold: "#10B981" },
  warning: { text: "#D97706", soft: "#FEF3C7", bold: "#F59E0B" },
  danger: { text: "#E11D48", soft: "#FFE4E6", bold: "#F43F5E" },
  info: { text: "#0284C7", soft: "#E0F2FE", bold: "#0EA5E9" },
  neutral: { text: "#475569", soft: "#F1F5F9", bold: "#64748B" },
};

/**
 * Tailwind class helpers — when class composition is easier than inline
 * style. Some places (e.g. dynamic borders, dots) still need the hex.
 */
export const INTENT_TW: Record<
  Intent,
  { text: string; soft: string; bold: string; dot: string; ring: string }
> = {
  success: {
    text: "text-emerald-600",
    soft: "bg-emerald-100",
    bold: "bg-emerald-500",
    dot: "bg-emerald-500",
    ring: "ring-emerald-100",
  },
  warning: {
    text: "text-amber-600",
    soft: "bg-amber-100",
    bold: "bg-amber-500",
    dot: "bg-amber-500",
    ring: "ring-amber-100",
  },
  danger: {
    text: "text-rose-600",
    soft: "bg-rose-100",
    bold: "bg-rose-500",
    dot: "bg-rose-500",
    ring: "ring-rose-100",
  },
  info: {
    text: "text-sky-600",
    soft: "bg-sky-100",
    bold: "bg-sky-500",
    dot: "bg-sky-500",
    ring: "ring-sky-100",
  },
  neutral: {
    text: "text-slate-600",
    soft: "bg-slate-100",
    bold: "bg-slate-500",
    dot: "bg-slate-500",
    ring: "ring-slate-100",
  },
};
