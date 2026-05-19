import { INTENT_HEX, type Intent } from "./semantic";

/**
 * Progress bar per design brief §4.7.
 *
 * Two modes:
 * - determinate: `value` in [0, 100], with optional `%` label rendered by caller
 * - indeterminate: sweeping gradient animation (used for scrape "running" state)
 */

type Props = {
  /** Determinate: 0-100. Ignored when `indeterminate` is true. */
  value?: number;
  indeterminate?: boolean;
  intent?: Intent;
  className?: string;
};

export function ProgressBar({ value = 0, indeterminate, intent = "info", className = "" }: Props) {
  const c = INTENT_HEX[intent];
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(value)}
      aria-valuetext={indeterminate ? "Yükleniyor" : undefined}
      className={["relative w-full h-1 rounded-full bg-slate-100 overflow-hidden", className].join(" ")}
    >
      {indeterminate ? (
        <div
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-2/5 rounded-full"
          style={{
            background: `linear-gradient(90deg, transparent, ${c.bold}, transparent)`,
            animation: "et-sweep 1.6s ease-in-out infinite",
          }}
        />
      ) : (
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: c.bold }}
        />
      )}
    </div>
  );
}
