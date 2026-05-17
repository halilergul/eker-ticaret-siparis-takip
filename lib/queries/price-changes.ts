import { createClient } from "@/lib/supabase/server";
import type { PriceChangesFilterState } from "@/lib/validations/price-changes-filter";

export type { PriceChangesFilterState } from "@/lib/validations/price-changes-filter";

export type PriceChangeRow = {
  productId: string;
  supplierSlug: string;
  productCode: string;
  productName: string;
  brand: string | null;
  oldPrice: number;
  newPrice: number;
  oldObservedAt: string;
  newObservedAt: string;
  changePct: number | null;
  changeAmount: number;
  lastOrderId: string | null;
  lastOrderNo: string | null;
  lastOrderAt: string | null;
};

type RpcRow = {
  product_id: string;
  supplier_slug: string;
  product_code: string;
  product_name: string;
  brand: string | null;
  old_price: number;
  new_price: number;
  old_observed_at: string;
  new_observed_at: string;
  change_pct: number | null;
  change_amount: number;
  last_order_id: string | null;
  last_order_no: string | null;
  last_order_at: string | null;
};

export async function listPriceChanges(
  filter: PriceChangesFilterState,
): Promise<PriceChangeRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_price_changes", {
    window_days: filter.windowDays,
    include_drops: filter.includeDrops,
  });
  if (error) throw new Error(`listPriceChanges failed: ${error.message}`);
  const rows = (data ?? []) as unknown as RpcRow[];
  return rows.map(toPriceChangeRow);
}

function toPriceChangeRow(r: RpcRow): PriceChangeRow {
  return {
    productId: r.product_id,
    supplierSlug: r.supplier_slug,
    productCode: r.product_code,
    productName: r.product_name,
    brand: r.brand,
    oldPrice: Number(r.old_price),
    newPrice: Number(r.new_price),
    oldObservedAt: r.old_observed_at,
    newObservedAt: r.new_observed_at,
    changePct: r.change_pct === null ? null : Number(r.change_pct),
    changeAmount: Number(r.change_amount),
    lastOrderId: r.last_order_id,
    lastOrderNo: r.last_order_no,
    lastOrderAt: r.last_order_at,
  };
}

export async function listAnySnapshotCount(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("price_snapshots")
    .select("id", { count: "exact", head: true })
    .not("unit_price_with_vat", "is", null);
  if (error) return 0;
  return count ?? 0;
}
