import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageShell } from "@/components/layout/page-shell";
import { OrderDetailCard } from "@/components/features/orders/order-detail-card";
import { getOrderDetail } from "@/lib/queries/orders";

export const metadata: Metadata = {
  title: "Sipariş Detayı — Eker Ticaret",
};

type Props = {
  params: Promise<{ id: string }>;
};

export default async function OrderDetailPage({ params }: Props) {
  const { id } = await params;
  const detail = await getOrderDetail(id);
  if (!detail) notFound();

  return (
    <PageShell>
      <OrderDetailCard detail={detail} />
    </PageShell>
  );
}
