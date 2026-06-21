import { createClient } from "@/lib/supabase/server";
import type { PriceChangesFilterState } from "@/lib/validations/price-changes-filter";

export type { PriceChangesFilterState } from "@/lib/validations/price-changes-filter";

export type PriceComparisonRow = {
  productId: string;
  supplierSlug: string;
  supplierName: string;
  productCode: string;
  productName: string;
  brand: string | null;
  /** Son sipariş anındaki KDV hariç net birim fiyat (TL). */
  lastOrderPriceExclVat: number;
  /** Son siparişin ISO timestamp (UTC). */
  lastOrderedAt: string;
  lastOrderNo: string;
  daysSinceLastOrder: number;
  /** Bugünkü tedarikçi catalog fiyatı (KDV hariç). Snapshot eksikse null. */
  currentPriceExclVat: number | null;
  currentPriceCapturedAt: string | null;
  /** 0..1 ratio (örn. 0.47 = %47 zam). Snapshot eksikse null. */
  changePct: number | null;
  /** TL fark (pozitif = zam). Snapshot eksikse null. */
  changeAmount: number | null;
};

type RpcRow = {
  product_id: string;
  supplier_slug: string;
  supplier_name: string;
  product_code: string;
  product_name: string;
  brand: string | null;
  last_order_price_excl_vat: number | string;
  last_ordered_at: string;
  last_order_no: string;
  days_since_last_order: number;
  current_price_excl_vat: number | string | null;
  current_price_captured_at: string | null;
  change_pct: number | string | null;
  change_amount: number | string | null;
};

export async function listPriceChanges(
  filter: PriceChangesFilterState,
): Promise<PriceComparisonRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_price_changes_v2", {
    filter_supplier_slug: filter.supplierSlug,
    filter_min_change_pct: filter.minChangePct,
    sort_by: filter.sortBy,
  });
  if (error) throw new Error(`listPriceChanges failed: ${error.message}`);
  const rows = (data ?? []) as unknown as RpcRow[];
  return rows.map(toPriceComparisonRow);
}

function toPriceComparisonRow(r: RpcRow): PriceComparisonRow {
  return {
    productId: r.product_id,
    supplierSlug: r.supplier_slug,
    supplierName: r.supplier_name,
    productCode: r.product_code,
    productName: r.product_name,
    brand: r.brand,
    lastOrderPriceExclVat: Number(r.last_order_price_excl_vat),
    lastOrderedAt: r.last_ordered_at,
    lastOrderNo: r.last_order_no,
    daysSinceLastOrder: Number(r.days_since_last_order),
    currentPriceExclVat: r.current_price_excl_vat === null ? null : Number(r.current_price_excl_vat),
    currentPriceCapturedAt: r.current_price_captured_at,
    changePct: r.change_pct === null ? null : Number(r.change_pct),
    changeAmount: r.change_amount === null ? null : Number(r.change_amount),
  };
}

export async function listAnySnapshotCount(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("price_snapshots")
    .select("id", { count: "exact", head: true })
    .not("unit_price", "is", null);
  if (error) return 0;
  return count ?? 0;
}
