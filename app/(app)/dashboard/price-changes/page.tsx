import type { Metadata } from "next";

import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { PriceChangeTable } from "@/components/features/price-changes/price-change-table";
import { PriceChangesFilterBar } from "@/components/features/price-changes/price-changes-filter-bar";
import {
  listAnySnapshotCount,
  listPriceChanges,
} from "@/lib/queries/price-changes";
import { listSuppliers } from "@/lib/queries/orders";
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
  const [rows, anyCount, suppliers] = await Promise.all([
    listPriceChanges(filter),
    listAnySnapshotCount(),
    listSuppliers(),
  ]);

  return (
    <PageShell>
      <PageHeader
        title="Zamlanan Ürünler"
        subtitle="Son siparişinizden bu yana zamlanan ürünler — birikimli zam dahil."
        actions={
          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 tnum">
            {rows.length} ürün
          </span>
        }
      />

      <section className="mb-5">
        <PriceChangesFilterBar
          suppliers={suppliers}
          currentSupplier={filter.supplierSlug}
          currentMinPct={filter.minChangePct}
          currentSort={filter.sortBy}
        />
      </section>

      <section>
        <PriceChangeTable rows={rows} hasAnySnapshot={anyCount > 0} />
      </section>
    </PageShell>
  );
}
