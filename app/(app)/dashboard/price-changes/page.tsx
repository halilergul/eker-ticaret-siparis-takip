import type { Metadata } from "next";
import {
  listAnySnapshotCount,
  listPriceChanges,
} from "@/lib/queries/price-changes";
import { parsePriceChangesFilter } from "@/lib/validations/price-changes-filter";
import { PriceChangeTable } from "@/components/features/price-changes/price-change-table";
import { WindowFilter } from "@/components/features/price-changes/window-filter";

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
    <main className="mx-auto max-w-6xl px-4 py-10">
      <header className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Zamlanan Ürünler
          </h1>
          <p className="text-sm text-slate-600">
            Son {filter.windowDays} gün içinde KDV dahil özel birim fiyatı
            değişen ürünler.
          </p>
        </div>
        <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
          {rows.length} ürün
        </span>
      </header>

      <section className="mt-6">
        <WindowFilter
          currentDays={filter.windowDays}
          currentShowDrops={filter.includeDrops}
        />
      </section>

      <section className="mt-6">
        <PriceChangeTable
          rows={rows}
          hasAnySnapshot={anyCount > 0}
          windowDays={filter.windowDays}
          includeDrops={filter.includeDrops}
        />
      </section>
    </main>
  );
}
