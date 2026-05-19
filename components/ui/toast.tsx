"use client";

import { useEffect, type ReactNode } from "react";

import { Icon, type IconName } from "./icon";
import { INTENT_TW, type Intent } from "./semantic";

/**
 * Toast notification per design brief §4.1.
 *
 * Lightweight controlled component — the parent owns visibility. A future
 * ToastStack manager can wrap this. For now we keep it presentational so
 * pages can render arrays of toasts inline.
 */

const INTENT_ICON: Record<Intent, IconName> = {
  success: "check",
  warning: "warning",
  danger: "x",
  info: "info",
  neutral: "info",
};

type Props = {
  intent?: Intent;
  title: string;
  body?: ReactNode;
  /** Optional inline action (e.g. "Görüntüle"). */
  action?: { label: string; onClick?: () => void };
  onClose?: () => void;
  /** Auto-dismiss after this many ms. 0 disables. Default: 4s success/info, 8s warning/danger. */
  autoCloseMs?: number;
};

export function Toast({
  intent = "info",
  title,
  body,
  action,
  onClose,
  autoCloseMs,
}: Props) {
  const c = INTENT_TW[intent];
  const isAlertish = intent === "danger" || intent === "warning";

  useEffect(() => {
    if (!onClose) return;
    const ms = autoCloseMs ?? (isAlertish ? 8000 : 4000);
    if (ms <= 0) return;
    const t = window.setTimeout(onClose, ms);
    return () => window.clearTimeout(t);
  }, [autoCloseMs, isAlertish, onClose]);

  return (
    <div
      role={isAlertish ? "alert" : "status"}
      className="et-glass-strong w-90 rounded-2xl p-3.5 flex items-start gap-3"
    >
      <span
        aria-hidden="true"
        className={[
          "flex-none w-8 h-8 rounded-full inline-flex items-center justify-center",
          c.soft,
          c.text,
        ].join(" ")}
      >
        <Icon name={INTENT_ICON[intent]} size={16} sw={2.2} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-900">{title}</div>
        {body ? <div className="text-[13px] text-slate-600 mt-0.5">{body}</div> : null}
      </div>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="flex-none text-[13px] font-medium text-slate-900 hover:text-slate-700 et-focus rounded"
        >
          {action.label} →
        </button>
      ) : null}
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Bildirimi kapat"
          className="flex-none w-5 h-5 rounded text-slate-400 hover:text-slate-700 flex items-center justify-center et-focus"
        >
          <Icon name="x" size={12} />
        </button>
      ) : null}
    </div>
  );
}

/** Container that anchors a toast stack to the bottom-right of the viewport. */
export function ToastStack({ children }: { children: ReactNode }) {
  return (
    <div
      aria-live="polite"
      className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 items-end pointer-events-none"
    >
      <div className="flex flex-col gap-3 items-end pointer-events-auto">{children}</div>
    </div>
  );
}
