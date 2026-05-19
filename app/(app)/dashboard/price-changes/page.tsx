import type { Metadata } from "next";

import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { PriceChangeTable } from "@/components/features/price-changes/price-change-table";
import { WindowFilter } from "@/components/features/price-changes/window-filter";
import {
  listAnySnapshotCount,
  listPriceChanges,
} from "@/lib/queries/price-changes";
import { parsePriceChangesFilter } from "@/lib/validations/price-changes-filter";

export const metadata: Metadata = {
  title: "Zamlanan Ürünler — Eker Ticaret",
};

type SearchParams = Record<string, string | string[] | undefined>;

type Props = {
  searchParams: Promise<SearchParams>;
};

export default async function PriceChangesPage({ searchParams }: Props) {
  const filter = parsePriceChangesFilter(await searchParams);
  const [rows, anyCount] = await Promise.all([
    listPriceChanges(filter),
    listAnySnapshotCount(),
  ]);

  return (
    <PageShell>
      <PageHeader
        title="Zamlanan Ürünler"
        subtitle={`Son ${filter.windowDays} gün içinde KDV dahil özel birim fiyatı değişen ürünler.`}
        actions={
          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 tnum">
            {rows.length} ürün
          </span>
        }
      />

      <section className="mb-5">
        <WindowFilter
          currentDays={filter.windowDays}
          currentShowDrops={filter.includeDrops}
        />
      </section>

      <section>
        <PriceChangeTable
          rows={rows}
          hasAnySnapshot={anyCount > 0}
          windowDays={filter.windowDays}
          includeDrops={filter.includeDrops}
        />
      </section>
    </PageShell>
  );
}
