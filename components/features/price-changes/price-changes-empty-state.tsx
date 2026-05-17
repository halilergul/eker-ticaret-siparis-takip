import { CopyCommandButton } from "@/components/features/orders/copy-command-button";

type Props = {
  hasAnySnapshot: boolean;
  windowDays: number;
  includeDrops: boolean;
};

const SCRAPE_COMMAND = "npm run scrape:catalog -- --supplier enderyapi";

export function PriceChangesEmptyState({
  hasAnySnapshot,
  windowDays,
  includeDrops,
}: Props) {
  if (!hasAnySnapshot) {
    return (
      <section className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
        <h2 className="text-base font-semibold text-slate-900">
          Henüz fiyat verisi yok.
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Tedarikçi kataloğundan ilk snapshot&apos;ları çekmek için aşağıdaki komutu
          çalıştır:
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-left">
          <code className="font-mono text-sm text-slate-100">
            {SCRAPE_COMMAND}
          </code>
          <CopyCommandButton command={SCRAPE_COMMAND} />
        </div>
      </section>
    );
  }

  // Snapshot var ama RPC sonuç döndüremedi → ya tek snapshot ya da değişiklik yok.
  return (
    <section className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
      <h2 className="text-base font-semibold text-slate-900">
        Son {windowDays} gün içinde {includeDrops ? "fiyat değişikliği" : "zam"}{" "}
        yok.
      </h2>
      <p className="mt-2 text-sm text-slate-600">
        Daha geniş bir pencere dene (örn. 30 veya 90 gün) ya da yeni bir scrape
        çalıştır. Karşılaştırma için her ürünün pencere içinde en az 2 farklı
        snapshot&apos;ı olmalı.
      </p>
    </section>
  );
}
