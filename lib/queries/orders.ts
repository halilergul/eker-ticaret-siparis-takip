import { createClient } from "@/lib/supabase/server";
import type { FilterState } from "@/lib/validations/order-filter";

export type { FilterState } from "@/lib/validations/order-filter";

export type OrderTableRow = {
  id: string;
  orderNo: string;
  supplierSlug: string;
  supplierName: string;
  status: string;
  orderedAt: string;
  totalAmount: number;
  currency: string;
};

export type OrderDetailItem = {
  id: string;
  productCode: string;
  productName: string;
  quantity: number;
  unitPriceAtOrder: number;
  lineTotal: number;
};

export type OrderDetail = {
  id: string;
  orderNo: string;
  supplierName: string;
  supplierSlug: string;
  status: string;
  orderedAt: string;
  totalAmount: number;
  currency: string;
  notes: string | null;
  items: OrderDetailItem[];
  computedTotal: number;
};

export type SupplierOption = {
  slug: string;
  name: string;
};

type SupplierJoin = { slug: string; name: string };

type OrderListRow = {
  id: string;
  order_no: string;
  status: string;
  ordered_at: string;
  total_amount: number;
  currency: string;
  supplier: SupplierJoin;
};

type OrderItemRow = {
  id: string;
  product_code: string;
  product_name: string;
  quantity: number;
  unit_price_at_order: number;
};

type OrderDetailRow = {
  id: string;
  order_no: string;
  status: string;
  ordered_at: string;
  total_amount: number;
  currency: string;
  notes: string | null;
  supplier: SupplierJoin;
  items: OrderItemRow[];
};

export async function listOrders(
  filter: FilterState = {},
): Promise<OrderTableRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("supplier_orders")
    .select(
      `id, order_no, status, ordered_at, total_amount, currency,
       supplier:suppliers!inner ( slug, name )`,
    )
    .order("ordered_at", { ascending: false });

  if (filter.supplierSlug) {
    query = query.eq("supplier.slug", filter.supplierSlug);
  }
  if (filter.status) {
    query = query.eq("status", filter.status);
  }

  const { data, error } = await query;
  if (error) throw new Error(`listOrders failed: ${error.message}`);
  const rows = (data ?? []) as unknown as OrderListRow[];
  return rows.map(toOrderTableRow);
}

export async function getOrderDetail(id: string): Promise<OrderDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("supplier_orders")
    .select(
      `id, order_no, status, ordered_at, total_amount, currency, notes,
       supplier:suppliers!inner ( slug, name ),
       items:order_items ( id, product_code, product_name, quantity, unit_price_at_order )`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`getOrderDetail failed: ${error.message}`);
  if (!data) return null;
  return toOrderDetail(data as unknown as OrderDetailRow);
}

export async function listSuppliers(): Promise<SupplierOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("slug, name")
    .order("name", { ascending: true });
  if (error) throw new Error(`listSuppliers failed: ${error.message}`);
  return data ?? [];
}

export async function listDistinctStatuses(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("supplier_orders")
    .select("status");
  if (error)
    throw new Error(`listDistinctStatuses failed: ${error.message}`);
  const set = new Set<string>((data ?? []).map((r) => r.status));
  return Array.from(set).sort((a, b) => a.localeCompare(b, "tr"));
}

function toOrderTableRow(r: OrderListRow): OrderTableRow {
  return {
    id: r.id,
    orderNo: r.order_no,
    supplierSlug: r.supplier.slug,
    supplierName: r.supplier.name,
    status: r.status,
    orderedAt: r.ordered_at,
    totalAmount: Number(r.total_amount),
    currency: r.currency,
  };
}

function toOrderDetail(r: OrderDetailRow): OrderDetail {
  const items: OrderDetailItem[] = (r.items ?? []).map((it) => {
    const qty = Number(it.quantity);
    const unit = Number(it.unit_price_at_order);
    return {
      id: it.id,
      productCode: it.product_code,
      productName: it.product_name,
      quantity: qty,
      unitPriceAtOrder: unit,
      lineTotal: Number((qty * unit).toFixed(2)),
    };
  });
  const computedTotal = Number(
    items.reduce((sum, it) => sum + it.lineTotal, 0).toFixed(2),
  );
  return {
    id: r.id,
    orderNo: r.order_no,
    supplierName: r.supplier.name,
    supplierSlug: r.supplier.slug,
    status: r.status,
    orderedAt: r.ordered_at,
    totalAmount: Number(r.total_amount),
    currency: r.currency,
    notes: r.notes,
    items,
    computedTotal,
  };
}
