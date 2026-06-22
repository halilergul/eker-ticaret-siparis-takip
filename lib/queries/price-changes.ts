import { createClient } from "@/lib/supabase/server";
import { PRICE_CHANGES_PAGE_SIZE } from "@/lib/constants/price-changes";
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

export type PriceChangesListResult = {
  rows: PriceComparisonRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
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
): Promise<PriceChangesListResult> {
  const supabase = await createClient();
  // SQL function sadece 4 sort_by tanıyor; yeni date sortları için JS resort.
  const isDateSort =
    filter.sortBy === "last_ordered_desc" || filter.sortBy === "last_ordered_asc";
  const sqlSortBy = isDateSort ? "change_pct" : filter.sortBy;
  const { data, error } = await supabase.rpc("get_price_changes_v2", {
    filter_supplier_slug: filter.supplierSlug,
    filter_min_change_pct: filter.minChangePct,
    sort_by: sqlSortBy,
  });
  if (error) throw new Error(`listPriceChanges failed: ${error.message}`);
  let all = (data ?? []) as unknown as RpcRow[];
  if (filter.sortBy === "last_ordered_desc") {
    all = [...all].sort((a, b) => b.last_ordered_at.localeCompare(a.last_ordered_at));
  } else if (filter.sortBy === "last_ordered_asc") {
    all = [...all].sort((a, b) => a.last_ordered_at.localeCompare(b.last_ordered_at));
  }
  const totalCount = all.length;
  const pageSize = PRICE_CHANGES_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  // Clamp page (URL'den gelen page totalPages > totalPages ise son sayfa)
  const page = Math.min(Math.max(filter.page, 1), totalPages);
  const offset = (page - 1) * pageSize;
  const rows = all.slice(offset, offset + pageSize).map(toPriceComparisonRow);
  return { rows, totalCount, page, pageSize, totalPages };
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
