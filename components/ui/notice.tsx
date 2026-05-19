"use client";

import { useState, type ReactNode } from "react";

import { Icon, type IconName } from "./icon";
import { INTENT_HEX, type Intent } from "./semantic";

/**
 * Inline notice / banner per design brief §4.2.
 * Glass surface, 3px left border in the intent color, leading icon,
 * title + optional body, optional CTA, optional dismiss.
 */

const INTENT_ICON: Record<Intent, IconName> = {
  success: "check",
  warning: "warning",
  danger: "alert",
  info: "info",
  neutral: "info",
};

type Props = {
  intent?: Intent;
  title: string;
  body?: ReactNode;
  cta?: { label: string; onClick?: () => void };
  dismissible?: boolean;
  /** Optional id used by the dismissible variant to persist state in localStorage. */
  persistKey?: string;
  className?: string;
};

export function Notice({
  intent = "info",
  title,
  body,
  cta,
  dismissible,
  persistKey,
  className = "",
}: Props) {
  const hex = INTENT_HEX[intent];
  const [hidden, setHidden] = useState(() => {
    if (typeof window === "undefined" || !persistKey) return false;
    return window.localStorage.getItem(`et-notice-${persistKey}`) === "dismissed";
  });

  function handleDismiss() {
    if (persistKey && typeof window !== "undefined") {
      window.localStorage.setItem(`et-notice-${persistKey}`, "dismissed");
    }
    setHidden(true);
  }

  if (hidden) return null;

  return (
    <div
      role={intent === "danger" || intent === "warning" ? "alert" : "status"}
      className={[
        "relative et-glass rounded-2xl py-3.5 px-4 flex items-start gap-3 overflow-hidden",
        className,
      ].join(" ")}
    >
      {/* left accent stripe (3px) */}
      <span
        aria-hidden="true"
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: hex.bold }}
      />
      <span
        className="flex-none mt-0.5 ml-1"
        style={{ color: hex.bold }}
        aria-hidden="true"
      >
        <Icon name={INTENT_ICON[intent]} size={20} sw={1.8} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-900">{title}</div>
        {body ? <div className="text-[13px] text-slate-600 mt-0.5">{body}</div> : null}
      </div>
      {cta ? (
        <button
          type="button"
          onClick={cta.onClick}
          className="flex-none text-[13px] font-medium text-slate-900 underline underline-offset-[3px] hover:text-slate-700 et-focus rounded"
        >
          {cta.label}
        </button>
      ) : null}
      {dismissible ? (
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Bildirimi kapat"
          className="flex-none w-6 h-6 rounded-md text-slate-400 hover:text-slate-700 flex items-center justify-center et-focus"
        >
          <Icon name="x" size={14} />
        </button>
      ) : null}
    </div>
  );
}
