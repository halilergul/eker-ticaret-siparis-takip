import { EmptyState } from "@/components/ui/empty-state";

/**
 * 012: Pencere kavramı kaldırıldı; empty state daha basit.
 */

type Props = {
  hasAnySnapshot: boolean;
};

export function PriceChangesEmptyState({ hasAnySnapshot }: Props) {
  if (!hasAnySnapshot) {
    return (
      <EmptyState
        icon="tool"
        title="Henüz fiyat verisi yok"
        body="İlk catalog scrape'i Ana Sayfa'daki tedarikçi kartlarından tetikleyebilirsin. Snapshot'lar geldikçe zamlanan ürünler burada görünür."
        cta={{ label: "Ana Sayfa'ya git" }}
      />
    );
  }

  return (
    <EmptyState
      icon="clock"
      title="Zamlanan ürün yok"
      body="Filtreleri değiştirmeyi deneyebilirsin. Hiçbir ürünün son siparişten bu yana zam görmediği anlamına da gelebilir."
    />
  );
}
