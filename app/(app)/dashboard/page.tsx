import type { Metadata } from "next";
import {
  listDistinctStatuses,
  listOrders,
  listSuppliers,
} from "@/lib/queries/orders";
import { parseFilter } from "@/lib/validations/order-filter";
import { FilterBar } from "@/components/features/orders/filter-bar";
import { OrderTable } from "@/components/features/orders/order-table";
import { SupplierTriggerCard } from "@/components/features/scrape/supplier-trigger-card";
import { listSchedules } from "@/lib/queries/scrape-schedule";
import { getLatestRunBySupplier } from "@/lib/queries/scrape-runs";

export const metadata: Metadata = {
  title: "Dashboard — Eker Ticaret",
};

type SearchParams = Record<string, string | string[] | undefined>;

type Props = {
  searchParams: Promise<SearchParams>;
};

export default async function DashboardPage({ searchParams }: Props) {
  const filter = parseFilter(await searchParams);
  const [orders, suppliers, statuses, schedules] = await Promise.all([
    listOrders(filter),
    listSuppliers(),
    listDistinctStatuses(),
    listSchedules(),
  ]);

  const triggerCards = await Promise.all(
    schedules.map(async (s) => ({
      supplier: {
        id: s.supplierId,
        slug: s.supplierSlug,
        name: s.supplierName,
      },
      lastRun: await getLatestRunBySupplier(s.supplierId),
    })),
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <header className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Sipariş Geçmişi
          </h1>
          <p className="text-sm text-slate-600">
            Tedarikçi sitelerden çekilmiş sipariş kayıtları.
          </p>
        </div>
        <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
          {orders.length} sipariş
        </span>
      </header>

      {triggerCards.length > 0 ? (
        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {triggerCards.map((card) => (
            <SupplierTriggerCard
              key={card.supplier.id}
              supplier={card.supplier}
              lastRun={card.lastRun}
            />
          ))}
        </section>
      ) : null}

      <section className="mt-8">
        <FilterBar
          suppliers={suppliers}
          statuses={statuses}
          currentSupplier={filter.supplierSlug}
          currentStatus={filter.status}
        />
      </section>

      <section className="mt-6">
        <OrderTable orders={orders} />
      </section>
    </main>
  );
}
