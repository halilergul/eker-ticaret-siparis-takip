import type { ReactNode } from "react";

import { Icon, type IconName } from "./icon";
import { Button } from "./button";

/**
 * Empty state per design brief §4.3.
 * Dashed border, slate-50/60 bg, centered 56px icon tile, H3 title,
 * optional body, optional CTA pill. Hardware-themed icons preferred
 * (box, archive, tool).
 *
 * Danger variant (rose-200 border, rose-50 bg) is used as the error-state
 * shell per §4.4.
 */

type Props = {
  icon: IconName;
  title: string;
  body?: ReactNode;
  cta?: { label: string; onClick?: () => void };
  intent?: "neutral" | "danger";
  className?: string;
};

export function EmptyState({ icon, title, body, cta, intent = "neutral", className = "" }: Props) {
  const danger = intent === "danger";
  return (
    <div
      className={[
        "rounded-2xl p-8 text-center flex flex-col items-center gap-3",
        "border-2 border-dashed",
        danger ? "border-rose-200 bg-rose-50/60" : "border-slate-300 bg-slate-50/60",
        className,
      ].join(" ")}
    >
      <div
        className={[
          "w-14 h-14 rounded-2xl border inline-flex items-center justify-center",
          danger ? "bg-rose-100 border-rose-200 text-rose-500" : "bg-white border-slate-200 text-slate-400",
        ].join(" ")}
      >
        <Icon name={icon} size={28} sw={1.5} />
      </div>
      <div className={["text-base font-semibold", danger ? "text-slate-900" : "text-slate-700"].join(" ")}>
        {title}
      </div>
      {body ? <div className="text-[13.5px] text-slate-500 max-w-md">{body}</div> : null}
      {cta ? (
        <div className="mt-1">
          <Button kind={danger ? "secondary" : "primary"} size="sm" onClick={cta.onClick}>
            {cta.label}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
