import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { ScrapeError } from "./errors";
import type { RawOrderItem, RawOrderSummary } from "./types";

let cachedClient: SupabaseClient<Database> | null = null;

export function getServiceClient(): SupabaseClient<Database> {
  if (cachedClient) return cachedClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new ScrapeError({
      mode: "missing-credentials",
      step: "bootstrap",
      details:
        "NEXT_PUBLIC_SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY .env.local'da tanımlı değil.",
    });
  }

  cachedClient = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

export async function getSupplierIdBySlug(slug: string): Promise<string> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("id")
    .eq("slug", slug)
    .single();

  if (error || !data) {
    throw new ScrapeError({
      mode: "supplier-not-found",
      step: "bootstrap",
      details: `suppliers tablosunda slug="${slug}" bulunamadı. Önce seed migration uygulanmalı.`,
    });
  }
  return data.id;
}

export type WriteOrderResult = {
  orderId: string;
  inserted: boolean;
};

/**
 * Sipariş başlığını idempotent yazar. Mevcut order_no varsa eski satırı korur.
 * Dönen `inserted` flag idempotency için kritik.
 */
export async function writeOrderHeader(
  supplierId: string,
  order: RawOrderSummary,
): Promise<WriteOrderResult> {
  const supabase = getServiceClient();

  // Önce mevcut kayıt var mı diye bak (idempotency için inserted=true/false ayrımı)
  const existing = await supabase
    .from("supplier_orders")
    .select("id")
    .eq("supplier_id", supplierId)
    .eq("order_no", order.orderNo)
    .maybeSingle();

  if (existing.error) {
    throw new ScrapeError({
      mode: "db-write-failed",
      step: "write-order-header",
      details: existing.error.message,
    });
  }

  if (existing.data) {
    return { orderId: existing.data.id, inserted: false };
  }

  const insert = await supabase
    .from("supplier_orders")
    .insert({
      supplier_id: supplierId,
      order_no: order.orderNo,
      status: order.status,
      ordered_at: order.orderedAt,
      total_amount: order.totalAmount,
    })
    .select("id")
    .single();

  if (insert.error || !insert.data) {
    throw new ScrapeError({
      mode: "db-write-failed",
      step: "write-order-header",
      details: insert.error?.message ?? "unknown",
    });
  }

  return { orderId: insert.data.id, inserted: true };
}

export type WriteItemsResult = {
  inserted: number;
  skipped: number;
};

/**
 * Sipariş satırlarını idempotent yazar. (order_id, product_code) unique constraint
 * üzerinden ON CONFLICT DO NOTHING.
 */
export async function writeOrderItems(
  orderId: string,
  items: RawOrderItem[],
): Promise<WriteItemsResult> {
  if (items.length === 0) return { inserted: 0, skipped: 0 };

  const supabase = getServiceClient();
  const rows = items.map((it) => ({
    order_id: orderId,
    product_code: it.productCode,
    product_name: it.productName,
    quantity: it.quantity,
    unit_price_at_order: it.unitPriceAtOrder,
  }));

  // Önce mevcut satırların kodlarını al — skipped sayımı için
  const existing = await supabase
    .from("order_items")
    .select("product_code")
    .eq("order_id", orderId);

  if (existing.error) {
    throw new ScrapeError({
      mode: "db-write-failed",
      step: "write-order-items",
      details: existing.error.message,
    });
  }

  const existingCodes = new Set(existing.data.map((r) => r.product_code));
  const newRows = rows.filter((r) => !existingCodes.has(r.product_code));

  if (newRows.length === 0) {
    return { inserted: 0, skipped: rows.length };
  }

  const insert = await supabase.from("order_items").insert(newRows);

  if (insert.error) {
    throw new ScrapeError({
      mode: "db-write-failed",
      step: "write-order-items",
      details: insert.error.message,
    });
  }

  return { inserted: newRows.length, skipped: rows.length - newRows.length };
}

export type RecordPriceResult = {
  productId: string;
  snapshotAdded: boolean;
};

/**
 * record_price_observation RPC'sini çağırır. Aynı fiyat ise snapshot eklenmez.
 * Dönüş: { productId, snapshotAdded }. snapshotAdded fiyat değişimine göre tahmin edilir
 * (RPC tek değer döndürüyor — productId; snapshot'ın gerçekten yazılıp yazılmadığını
 * tespit etmek için bir before-call price snapshot count'una bakmak gerekir).
 */
export async function recordPriceObservation(
  supplierId: string,
  code: string,
  name: string,
  unitPrice: number | null,
): Promise<RecordPriceResult> {
  const supabase = getServiceClient();

  // Snapshot eklenecek mi? Fonksiyon çağrısından önce mevcut current_unit_price'i oku.
  const beforeQuery = await supabase
    .from("products")
    .select("id, current_unit_price")
    .eq("supplier_id", supplierId)
    .eq("code", code)
    .maybeSingle();

  if (beforeQuery.error) {
    throw new ScrapeError({
      mode: "db-write-failed",
      step: "record-price-observation",
      details: beforeQuery.error.message,
    });
  }

  const beforePrice = beforeQuery.data?.current_unit_price ?? null;
  // Snapshot ekleneceğini tahmin et: ürün yoksa + fiyat var ise YA DA ürün var ama fiyat farklı
  const snapshotAdded =
    unitPrice !== null &&
    (beforeQuery.data === null || beforePrice !== unitPrice);

  const { data, error } = await supabase.rpc("record_price_observation", {
    p_supplier_id: supplierId,
    p_product_code: code,
    p_product_name: name,
    p_unit_price: unitPrice as number, // RPC nullable kabul ediyor; type cast
  });

  if (error || !data) {
    throw new ScrapeError({
      mode: "db-write-failed",
      step: "record-price-observation",
      details: error?.message ?? "unknown",
    });
  }

  return { productId: data as string, snapshotAdded };
}
