import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageShell } from "@/components/layout/page-shell";
import { ProductHeaderCard } from "@/components/features/price-changes/product-header-card";
import { ProductHistoryTable } from "@/components/features/price-changes/product-history-table";
import { ProductOrdersList } from "@/components/features/price-changes/product-orders-list";
import { Sparkline } from "@/components/features/price-changes/sparkline";
import {
  getProductById,
  listProductOrders,
  listProductSnapshots,
} from "@/lib/queries/products";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const product = await getProductById(id).catch(() => null);
  return {
    title: product ? `${product.name} — Eker Ticaret` : "Ürün — Eker Ticaret",
  };
}

export default async function ProductDetailPage({ params }: Props) {
  const { id } = await params;
  const product = await getProductById(id);
  if (!product) notFound();

  const [snapshots, orders] = await Promise.all([
    listProductSnapshots(id),
    listProductOrders(id),
  ]);

  // Sparkline için ascending sıralı kullan
  const sparklinePoints = snapshots
    .map((s) => ({
      capturedAt: s.capturedAt,
      price: s.unitPriceWithVat,
    }))
    .reverse();

  return (
    <PageShell>
      <div className="space-y-6">
        <ProductHeaderCard product={product} />

        {sparklinePoints.length >= 2 ? (
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="t-cap mb-2">Fiyat seyri</h2>
            <Sparkline points={sparklinePoints} />
          </section>
        ) : null}

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-900">
            Snapshot Tarihçesi
          </h2>
          <ProductHistoryTable snapshots={snapshots} />
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-900">
            Bu Ürünün Geçtiği Siparişler
          </h2>
          <ProductOrdersList orders={orders} />
        </section>
      </div>
    </PageShell>
  );
}
