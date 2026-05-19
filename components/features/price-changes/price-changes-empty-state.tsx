import { EmptyState } from "@/components/ui/empty-state";

/**
 * Empty state per design brief §4.3 for the price-changes table.
 *
 * Two variants:
 * - hasAnySnapshot=false: hardware shop has never run a catalog scrape yet.
 *   Guide them to trigger one from the dashboard.
 * - hasAnySnapshot=true but window has no changes: encourage widening the
 *   window or waiting for the next scheduled scrape.
 */

type Props = {
  hasAnySnapshot: boolean;
  windowDays: number;
  includeDrops: boolean;
};

export function PriceChangesEmptyState({
  hasAnySnapshot,
  windowDays,
  includeDrops,
}: Props) {
  if (!hasAnySnapshot) {
    return (
      <EmptyState
        icon="tool"
        title="Henüz fiyat verisi yok"
        body="İlk catalog scrape'i Ana Sayfa'daki tedarikçi kartlarından tetikleyebilirsin. Snapshot'lar geldikçe fiyat değişiklikleri burada görünür."
        cta={{ label: "Ana Sayfa'ya git" }}
      />
    );
  }

  return (
    <EmptyState
      icon="clock"
      title={`Son ${windowDays} gün içinde ${includeDrops ? "fiyat değişikliği" : "zam"} yok`}
      body="Daha geniş bir pencere dene (örn. 30 veya 90 gün) ya da yeni bir scrape çalıştır. Karşılaştırma için her ürünün pencere içinde en az 2 farklı snapshot'ı olmalı."
    />
  );
}
