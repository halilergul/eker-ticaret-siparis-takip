"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { ROUTES } from "@/lib/routes";

type Props = {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
};

export function PriceChangesPagination({ page, totalPages, totalCount, pageSize }: Props) {
  const searchParams = useSearchParams();
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);

  function hrefForPage(target: number): string {
    const sp = new URLSearchParams(searchParams.toString());
    if (target <= 1) sp.delete("page");
    else sp.set("page", String(target));
    const qs = sp.toString();
    return qs ? `${ROUTES.PRICE_CHANGES}?${qs}` : ROUTES.PRICE_CHANGES;
  }

  const pageNumbers = buildPageList(page, totalPages);

  return (
    <nav
      aria-label="Sayfalama"
      className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"
    >
      <p className="text-[13px] text-slate-500 tnum">
        <span className="font-medium text-slate-700">{from}</span>
        <span className="mx-1">–</span>
        <span className="font-medium text-slate-700">{to}</span>
        <span className="mx-1">/</span>
        <span className="font-medium text-slate-700">{totalCount}</span> ürün
      </p>

      <div className="flex items-center gap-1">
        <PageLink
          href={hrefForPage(page - 1)}
          disabled={page <= 1}
          label="Önceki sayfa"
        >
          ←
        </PageLink>

        {pageNumbers.map((entry, idx) =>
          entry === "…" ? (
            <span
              key={`gap-${idx}`}
              className="px-2 text-[13px] text-slate-400"
              aria-hidden="true"
            >
              …
            </span>
          ) : (
            <PageLink
              key={entry}
              href={hrefForPage(entry)}
              active={entry === page}
              label={`Sayfa ${entry}`}
            >
              {entry}
            </PageLink>
          ),
        )}

        <PageLink
          href={hrefForPage(page + 1)}
          disabled={page >= totalPages}
          label="Sonraki sayfa"
        >
          →
        </PageLink>
      </div>
    </nav>
  );
}

type PageLinkProps = {
  href: string;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  label: string;
};

function PageLink({ href, children, active, disabled, label }: PageLinkProps) {
  const className = active
    ? "inline-flex h-8 min-w-8 items-center justify-center rounded-lg bg-slate-900 px-2.5 text-[13px] font-semibold text-white tnum"
    : "inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2.5 text-[13px] font-medium text-slate-600 tnum hover:bg-slate-100 hover:text-slate-900 et-focus";

  if (disabled) {
    return (
      <span
        aria-disabled="true"
        aria-label={label}
        className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2.5 text-[13px] font-medium text-slate-300 tnum"
      >
        {children}
      </span>
    );
  }

  return (
    <Link href={href} aria-label={label} aria-current={active ? "page" : undefined} className={className}>
      {children}
    </Link>
  );
}

function buildPageList(current: number, total: number): Array<number | "…"> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const result: Array<number | "…"> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) result.push("…");
  for (let i = start; i <= end; i++) result.push(i);
  if (end < total - 1) result.push("…");
  result.push(total);
  return result;
}
