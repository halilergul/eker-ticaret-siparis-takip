import type { Metadata } from "next";
import {
  listDistinctStatuses,
  listOrders,
  listSuppliers,
} from "@/lib/queries/orders";
import { parseFilter } from "@/lib/validations/order-filter";
import { FilterBar } from "@/components/features/orders/filter-bar";
import { OrderTable } from "@/components/features/orders/order-table";

export const metadata: Metadata = {
  title: "Dashboard — Eker Ticaret",
};

type SearchParams = Record<string, string | string[] | undefined>;

type Props = {
  searchParams: Promise<SearchParams>;
};

export default async function DashboardPage({ searchParams }: Props) {
  const filter = parseFilter(await searchParams);
  const [orders, suppliers, statuses] = await Promise.all([
    listOrders(filter),
    listSuppliers(),
    listDistinctStatuses(),
  ]);

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

      <section className="mt-6">
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
