import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getOrderDetail } from "@/lib/queries/orders";
import { OrderDetailCard } from "@/components/features/orders/order-detail-card";

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
    <main className="mx-auto max-w-4xl px-4 py-10">
      <OrderDetailCard detail={detail} />
    </main>
  );
}
