import type { Metadata } from "next";

import { Notice } from "@/components/ui/notice";
import { FilterBar } from "@/components/features/orders/filter-bar";
import { OrderTable } from "@/components/features/orders/order-table";
import { SupplierTriggerCard } from "@/components/features/scrape/supplier-trigger-card";
import {
  listDistinctStatuses,
  listOrders,
  listSuppliers,
} from "@/lib/queries/orders";
import { getLatestRunBySupplier } from "@/lib/queries/scrape-runs";
import { listSchedules } from "@/lib/queries/scrape-schedule";
import { parseFilter } from "@/lib/validations/order-filter";

export const metadata: Metadata = {
  title: "Komuta Paneli — Eker Ticaret",
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
      autoEnabled: s.enabled,
    })),
  );

  const disabledSchedules = triggerCards
    .filter((c) => !c.autoEnabled)
    .map((c) => c.supplier.name);

  return (
    <main className="mx-auto max-w-7xl px-6 pb-12 lg:px-10">
      {/* Page header */}
      <header className="mb-7 flex items-start justify-between gap-6">
        <div>
          <div className="t-cap mb-2">{formatTodayCaption()}</div>
          <h1 className="t-h1 m-0 text-slate-900">Komuta Paneli</h1>
          <p className="mt-1.5 text-sm text-slate-600">
            {schedules.length} tedarikçi
            <span className="mx-2 text-slate-300">·</span>
            {orders.length} sipariş takip ediliyor
          </p>
        </div>
      </header>

      {/* Top notice: auto-scrape disabled */}
      {disabledSchedules.length > 0 ? (
        <div className="mb-6">
          <Notice
            intent="warning"
            title="Otomatik scrape kapalı"
            body={
              disabledSchedules.length === schedules.length
                ? "Tüm tedarikçiler için otomatik scrape kapalı. Veriler eski olabilir; manuel tetikleme gerekiyor."
                : `${disabledSchedules.join(", ")} için otomatik scrape kapalı. Manuel tetikleme gerekiyor.`
            }
            cta={{ label: "Ayarlara git" }}
            dismissible
            persistKey="auto-scrape-disabled"
          />
        </div>
      ) : null}

      {/* Supplier trigger cards */}
      {triggerCards.length > 0 ? (
        <section className="mb-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {triggerCards.map((card) => (
            <SupplierTriggerCard
              key={card.supplier.id}
              supplier={card.supplier}
              lastRun={card.lastRun}
            />
          ))}
        </section>
      ) : null}

      {/* Filter bar */}
      <section className="mb-5">
        <FilterBar
          suppliers={suppliers}
          statuses={statuses}
          currentSupplier={filter.supplierSlug}
          currentStatus={filter.status}
        />
      </section>

      {/* Orders section header */}
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="t-h2 text-slate-900">Son siparişler</h2>
        <span className="text-[13px] text-slate-500 tnum">
          {orders.length} sipariş
        </span>
      </div>

      {/* Orders accordion table */}
      <OrderTable orders={orders} />
    </main>
  );
}

function formatTodayCaption(): string {
  // "18.05.2026 · Pazartesi" — picked once on the server.
  const now = new Date();
  const date = new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Istanbul",
  }).format(now);
  const weekday = new Intl.DateTimeFormat("tr-TR", {
    weekday: "long",
    timeZone: "Europe/Istanbul",
  }).format(now);
  // Capitalize the first letter of the Turkish weekday
  const weekdayCap = weekday.charAt(0).toLocaleUpperCase("tr-TR") + weekday.slice(1);
  return `${date} · ${weekdayCap}`;
}
