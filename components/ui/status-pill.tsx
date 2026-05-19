import type { ReactNode } from "react";

import { INTENT_TW, type Intent } from "./semantic";

/**
 * Status pill per design brief §3.13.
 * 22px height, rounded-full, leading 6px dot in matching bold color,
 * 11px medium uppercase letter-spacing 0.04em label.
 */

type Props = {
  intent?: Intent;
  /** Show the leading colored dot (default true). */
  dot?: boolean;
  children: ReactNode;
  className?: string;
};

export function StatusPill({ intent = "neutral", dot = true, children, className = "" }: Props) {
  const c = INTENT_TW[intent];
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 h-[22px] px-2.5 rounded-full",
        c.soft,
        c.text,
        "text-[11px] font-medium uppercase tracking-wider",
        className,
      ].join(" ")}
    >
      {dot ? <span className={["h-1.5 w-1.5 rounded-full", c.dot].join(" ")} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
