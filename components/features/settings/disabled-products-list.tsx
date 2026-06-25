import { EmptyState } from "@/components/ui/empty-state";
import { formatTrDate } from "@/lib/format/date";
import { listDisabledProducts } from "@/lib/queries/products";

/**
 * 015: Bir tedarikçi için devre dışı bırakılan ürünler. 3 ardışık gün catalog
 * scrape başarısız olunca otomatik disable olur; tek başarı tekrar enable eder.
 * Boş listede component hiç render olmaz.
 */
type Props = {
  supplierId: string;
};

export async function DisabledProductsList({ supplierId }: Props) {
  const products = await listDisabledProducts(supplierId);

  if (products.length === 0) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h3 className="t-h3 text-slate-900">Devre dışı ürünler</h3>
        <span className="text-[13px] text-slate-500 tnum">{products.length}</span>
      </div>
      <details className="rounded-xl border border-slate-200 bg-white">
        <summary className="cursor-pointer px-4 py-3 text-[13px] text-slate-700 hover:bg-slate-50 select-none">
          {products.length} ürün catalog'da bulunamıyor — listeyi göster
        </summary>
        <div className="overflow-hidden border-t border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left">
                <th className="t-cap px-4 py-2.5">Ürün Kodu</th>
                <th className="t-cap px-4 py-2.5">Ürün</th>
                <th className="t-cap px-4 py-2.5">Son hata</th>
                <th className="t-cap px-4 py-2.5">Devre dışı</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                    {p.code}
                  </td>
                  <td className="px-4 py-2.5 text-[13px] text-slate-700">
                    {p.name}
                    {p.brand ? (
                      <span className="ml-1 text-xs text-slate-400">· {p.brand}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-slate-500 tnum">
                    {p.lastFailureDay ? formatTrDate(p.lastFailureDay) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-slate-500 tnum">
                    {p.disabledAt ? formatTrDate(p.disabledAt) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="text-xs text-slate-500">
        Her scrape'te yine denenir. Bir kez fiyat bulunursa otomatik geri açılır.
      </p>
    </section>
  );
}
