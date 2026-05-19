import { INTENT_TW } from "./semantic";

/**
 * Trend / delta indicator per design brief §4.9.
 *
 * Color logic:
 * - kind="price": up = rose (price hike = bad for the merchant), down = emerald
 * - kind="success": up = emerald, down = rose (scrape success rate)
 *
 * Always renders both color AND a directional caret — no color-only signaling.
 */

type Props = {
  /** Signed percentage. Negative = down. */
  delta: number;
  /** Optional grey comparator label (e.g. "son haftaya göre"). */
  comparator?: string;
  /** Inversion: price=hike-is-bad (default), success=up-is-good. */
  kind?: "price" | "success";
  /** Wrap in a rounded-full soft-bg badge. */
  badge?: boolean;
  /** Fraction digits in the delta value (default 1). */
  decimals?: number;
};

export function Trend({ delta, comparator, kind = "price", badge = false, decimals = 1 }: Props) {
  const up = delta > 0;
  const isGood = kind === "price" ? !up : up;
  const intent = isGood ? "success" : "danger";
  const c = INTENT_TW[intent];
  const sign = up ? "+" : "−";
  const label = `${sign}${Math.abs(delta).toFixed(decimals)}%`;

  const inner = (
    <span className={["inline-flex items-center gap-1 tnum", c.text].join(" ")}>
      <CaretIcon up={up} />
      <span className="text-xs font-medium">{label}</span>
      {comparator ? <span className="text-slate-400 font-normal">{comparator}</span> : null}
    </span>
  );

  if (!badge) return inner;

  return (
    <span className={["inline-flex items-center rounded-full px-2.5 py-1", c.soft].join(" ")}>
      {inner}
    </span>
  );
}

function CaretIcon({ up }: { up: boolean }) {
  // 12px caret, 2.4 stroke for emphasis
  const d = up ? "M6 14l6-6 6 6" : "M6 10l6 6 6-6";
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
