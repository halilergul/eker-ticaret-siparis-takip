import type { ReactNode } from "react";

/**
 * Standard page container — used by every screen inside the (app) group.
 *
 * Width and padding live here so every page has identical horizontal
 * geometry (1280px max, 24/40px responsive side gutter, bottom 48px).
 * The (app)/layout.tsx already provides the top spacer past the floating
 * TopNav (pt-28).
 */

type Props = {
  children: ReactNode;
  className?: string;
};

export function PageShell({ children, className = "" }: Props) {
  return (
    <main className={["mx-auto max-w-7xl px-6 pb-12 lg:px-10", className].join(" ")}>
      {children}
    </main>
  );
}

/**
 * Standard page header — small uppercase caption + H1 + optional subtitle +
 * optional right-aligned action cluster.
 *
 * Caption is intentionally small and quiet (date / breadcrumb / kategori).
 * The page-to-content gap is fixed at 28px (mb-7) so every screen breathes
 * the same way past the floating TopNav.
 */

type PageHeaderProps = {
  caption?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({ caption, title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="mb-7 flex items-start justify-between gap-6">
      <div className="min-w-0">
        {caption ? <div className="t-cap mb-2">{caption}</div> : null}
        <h1 className="t-h1 m-0 text-slate-900">{title}</h1>
        {subtitle ? (
          <div className="mt-1.5 text-sm text-slate-600">{subtitle}</div>
        ) : null}
      </div>
      {actions ? <div className="flex flex-none items-center gap-2.5">{actions}</div> : null}
    </header>
  );
}
