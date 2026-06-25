import { createClient } from "@/lib/supabase/server";

export type ProductSummary = {
  id: string;
  code: string;
  name: string;
  brand: string | null;
  supplierSlug: string;
  supplierName: string;
  vatRate: number;
  currentUnitPriceWithVat: number | null;
  currentObservedAt: string | null;
};

export type ProductSnapshot = {
  id: string;
  capturedAt: string;
  unitPriceWithVat: number;
  unitPriceExclVat: number | null;
  listPrice: number | null;
  discountText: string | null;
  vatRate: number | null;
  source: string;
  changeFromPrevAmount: number | null;
  changeFromPrevPct: number | null;
};

export type ProductOrderHistoryItem = {
  orderId: string;
  orderNo: string;
  orderedAt: string;
  quantity: number;
  unitPriceAtOrder: number;
  lineTotal: number;
  supplierSlug: string;
  supplierName: string;
};

type SupplierJoin = { slug: string; name: string };

export async function getProductById(id: string): Promise<ProductSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      `id, code, name, brand, vat_rate,
       supplier:suppliers!inner ( slug, name )`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getProductById failed: ${error.message}`);
  if (!data) return null;

  const product = data as unknown as {
    id: string;
    code: string;
    name: string;
    brand: string | null;
    vat_rate: number;
    supplier: SupplierJoin;
  };

  const { data: snap } = await supabase
    .from("price_snapshots")
    .select("unit_price_with_vat, captured_at")
    .eq("product_id", id)
    .not("unit_price_with_vat", "is", null)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    id: product.id,
    code: product.code,
    name: product.name,
    brand: product.brand,
    supplierSlug: product.supplier.slug,
    supplierName: product.supplier.name,
    vatRate: Number(product.vat_rate),
    currentUnitPriceWithVat:
      snap?.unit_price_with_vat != null ? Number(snap.unit_price_with_vat) : null,
    currentObservedAt: snap?.captured_at ?? null,
  };
}

type SnapshotRow = {
  id: string;
  captured_at: string;
  unit_price_with_vat: number | null;
  unit_price: number | null;
  list_price: number | null;
  discount_text: string | null;
  vat_rate: number | null;
  source: string;
};

export async function listProductSnapshots(
  productId: string,
): Promise<ProductSnapshot[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("price_snapshots")
    .select(
      `id, captured_at, unit_price_with_vat, unit_price, list_price, discount_text, vat_rate, source`,
    )
    .eq("product_id", productId)
    .not("unit_price_with_vat", "is", null)
    .order("captured_at", { ascending: true });
  if (error) throw new Error(`listProductSnapshots failed: ${error.message}`);
  const rows = (data ?? []) as unknown as SnapshotRow[];

  const withChange: ProductSnapshot[] = rows.map((curr, i) => {
    const prev = i > 0 ? rows[i - 1] : null;
    const currPrice = Number(curr.unit_price_with_vat ?? 0);
    const prevPrice = prev?.unit_price_with_vat != null
      ? Number(prev.unit_price_with_vat)
      : null;
    const changeAmount =
      prevPrice !== null ? Number((currPrice - prevPrice).toFixed(2)) : null;
    const changePct =
      prevPrice !== null && prevPrice > 0
        ? (currPrice - prevPrice) / prevPrice
        : null;
    return {
      id: curr.id,
      capturedAt: curr.captured_at,
      unitPriceWithVat: currPrice,
      unitPriceExclVat: curr.unit_price != null ? Number(curr.unit_price) : null,
      listPrice: curr.list_price != null ? Number(curr.list_price) : null,
      discountText: curr.discount_text,
      vatRate: curr.vat_rate != null ? Number(curr.vat_rate) : null,
      source: curr.source,
      changeFromPrevAmount: changeAmount,
      changeFromPrevPct: changePct,
    };
  });

  return withChange.reverse();
}

type OrderItemJoin = {
  quantity: number;
  unit_price_at_order: number;
  order: {
    id: string;
    order_no: string;
    ordered_at: string;
    supplier: SupplierJoin;
  };
};

export async function listProductOrders(
  productId: string,
): Promise<ProductOrderHistoryItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("order_items")
    .select(
      `quantity, unit_price_at_order,
       order:supplier_orders!inner (
         id, order_no, ordered_at,
         supplier:suppliers!inner ( slug, name )
       )`,
    )
    .eq("product_id", productId)
    .order("ordered_at", { ascending: false, referencedTable: "supplier_orders" });
  if (error) throw new Error(`listProductOrders failed: ${error.message}`);

  const rows = (data ?? []) as unknown as OrderItemJoin[];
  return rows.map((r) => {
    const qty = Number(r.quantity);
    const unit = Number(r.unit_price_at_order);
    return {
      orderId: r.order.id,
      orderNo: r.order.order_no,
      orderedAt: r.order.ordered_at,
      quantity: qty,
      unitPriceAtOrder: unit,
      lineTotal: Number((qty * unit).toFixed(2)),
      supplierSlug: r.order.supplier.slug,
      supplierName: r.order.supplier.name,
    };
  });
}

export type DisabledProductRow = {
  id: string;
  code: string;
  name: string;
  brand: string | null;
  consecutiveFailureDays: number;
  lastFailureDay: string | null;
  disabledAt: string | null;
};

/**
 * 015: Bir tedarikçi için tracking_enabled=false olan ürünler (3 ardışık gün
 * catalog scrape başarısız olduktan sonra otomatik devre dışı bırakılan).
 */
export async function listDisabledProducts(
  supplierId: string,
): Promise<DisabledProductRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, code, name, brand, consecutive_failure_days, last_failure_day, disabled_at")
    .eq("supplier_id", supplierId)
    .eq("tracking_enabled", false)
    .order("disabled_at", { ascending: false, nullsFirst: false });
  if (error) throw new Error(`listDisabledProducts failed: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    brand: r.brand,
    consecutiveFailureDays: Number(r.consecutive_failure_days ?? 0),
    lastFailureDay: r.last_failure_day,
    disabledAt: r.disabled_at,
  }));
}
