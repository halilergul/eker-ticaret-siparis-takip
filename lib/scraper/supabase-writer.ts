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
 * Sipariş satırlarını idempotent yazar. Her item için önce products tablosuna
 * ensureProduct çağırır (kod + ad + catalogUrl ile upsert), dönen product_id
 * order_items satırına yazılır. Böylece sipariş scrape sırasında catalog URL
 * keşfi otomatik gerçekleşir; ileride catalog scrape direkt cache hit yapar.
 */
export async function writeOrderItems(
  supplierId: string,
  orderId: string,
  items: RawOrderItem[],
): Promise<WriteItemsResult> {
  if (items.length === 0) return { inserted: 0, skipped: 0 };

  const supabase = getServiceClient();

  // 1) Her item için ensureProduct → productId al + catalog_url cache'le
  const itemsWithProductId: Array<{
    item: RawOrderItem;
    productId: string;
  }> = [];
  for (const it of items) {
    try {
      const ensured = await ensureProduct({
        supplierId,
        code: it.productCode,
        productName: it.productName,
        catalogUrl: it.catalogUrl ?? undefined,
        barcode: it.barcode ?? null,
      });
      itemsWithProductId.push({ item: it, productId: ensured.productId });
    } catch {
      // ensureProduct fail → product_id NULL ile order_item yazılır (best effort)
      itemsWithProductId.push({ item: it, productId: "" });
    }
  }

  // 2) Mevcut satırların kodlarını al (idempotency)
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
  const newRows = itemsWithProductId
    .filter(({ item }) => !existingCodes.has(item.productCode))
    .map(({ item, productId }) => ({
      order_id: orderId,
      product_id: productId || null,
      product_code: item.productCode,
      product_name: item.productName,
      quantity: item.quantity,
      unit_price_at_order: item.unitPriceAtOrder,
    }));

  if (newRows.length === 0) {
    return { inserted: 0, skipped: items.length };
  }

  const insert = await supabase.from("order_items").insert(newRows);

  if (insert.error) {
    throw new ScrapeError({
      mode: "db-write-failed",
      step: "write-order-items",
      details: insert.error.message,
    });
  }

  return { inserted: newRows.length, skipped: items.length - newRows.length };
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

export type EnsureProductParams = {
  supplierId: string;
  code: string;
  productName?: string;
  brand?: string;
  vatRate?: number;
  currentUnitPrice?: number;
  catalogUrl?: string;
  /** Tedarikçi tarafındaki barkod (Levent Şimşek için catalog search-key) */
  barcode?: string | null;
  /** Hotlink edilebilir ürün görseli URL'si (Faz B — UI kartlarında gösterilir) */
  imageUrl?: string | null;
};

export type EnsureProductResult = {
  productId: string;
  created: boolean;
  backfilledOrderItems: number;
};

/**
 * Catalog scrape sırasında ürünü products tablosuna upsert eder.
 * Mevcut order_items satırlarında product_id NULL olanları product_code üzerinden bağlar.
 */
export async function ensureProduct(
  params: EnsureProductParams,
): Promise<EnsureProductResult> {
  const supabase = getServiceClient();

  const existing = await supabase
    .from("products")
    .select("id")
    .eq("supplier_id", params.supplierId)
    .eq("code", params.code)
    .maybeSingle();

  if (existing.error) {
    throw new ScrapeError({
      mode: "db-write-failed",
      step: "ensure-product",
      details: existing.error.message,
    });
  }

  let productId: string;
  let created = false;

  if (existing.data) {
    productId = existing.data.id;
    const updates: Database["public"]["Tables"]["products"]["Update"] = {};
    if (params.productName) updates.name = params.productName;
    if (params.brand !== undefined) updates.brand = params.brand;
    if (params.vatRate !== undefined) updates.vat_rate = params.vatRate;
    if (params.catalogUrl !== undefined) updates.catalog_url = params.catalogUrl;
    if (params.barcode !== undefined && params.barcode !== null) {
      updates.barcode = params.barcode;
    }
    if (params.imageUrl !== undefined && params.imageUrl !== null) {
      updates.image_url = params.imageUrl;
    }
    if (params.currentUnitPrice !== undefined) {
      updates.current_unit_price = params.currentUnitPrice;
      updates.last_seen_at = new Date().toISOString();
    }
    if (Object.keys(updates).length > 0) {
      const update = await supabase
        .from("products")
        .update(updates)
        .eq("id", productId);
      if (update.error) {
        throw new ScrapeError({
          mode: "db-write-failed",
          step: "ensure-product",
          details: update.error.message,
        });
      }
    }
  } else {
    const insert = await supabase
      .from("products")
      .insert({
        supplier_id: params.supplierId,
        code: params.code,
        name: params.productName ?? params.code,
        brand: params.brand ?? null,
        catalog_url: params.catalogUrl ?? null,
        barcode: params.barcode ?? null,
        image_url: params.imageUrl ?? null,
        vat_rate: params.vatRate ?? 0.2,
        current_unit_price: params.currentUnitPrice ?? null,
        last_seen_at: params.currentUnitPrice !== undefined ? new Date().toISOString() : null,
      })
      .select("id")
      .single();
    if (insert.error || !insert.data) {
      throw new ScrapeError({
        mode: "db-write-failed",
        step: "ensure-product",
        details: insert.error?.message ?? "unknown",
      });
    }
    productId = insert.data.id;
    created = true;
  }

  // Back-fill: aynı tedarikçinin product_code'u eşleşen order_items.product_id NULL olanları doldur.
  const backfill = await supabase
    .from("order_items")
    .update({ product_id: productId })
    .eq("product_code", params.code)
    .is("product_id", null)
    .select("id");

  let backfilledOrderItems = 0;
  if (backfill.error) {
    // Back-fill best-effort; ölümcül değil.
    console.warn(
      `[ensureProduct] back-fill warn for ${params.code}: ${backfill.error.message}`,
    );
  } else {
    backfilledOrderItems = backfill.data?.length ?? 0;
  }

  return { productId, created, backfilledOrderItems };
}

export type WritePriceSnapshotParams = {
  productId: string;
  unitPriceWithVat: number;
  unitPriceExclVat?: number;
  listPrice?: number | null;
  discountText?: string | null;
  vatRate?: number;
  source?: "catalog" | "order";
  capturedAt?: string;
};

export async function writePriceSnapshot(
  params: WritePriceSnapshotParams,
): Promise<{ snapshotId: string | null; inserted: boolean }> {
  const supabase = getServiceClient();

  // Idempotency check (009): aynı ürün için son snapshot'ı oku; aynı unit_price ise insert atla.
  // `unit_price` = canonical takip değişkeni (catalog için Net Fiyat veya KDV hariç). Aynı
  // fiyatla yapılan ardışık scrape'ler duplikasyon yaratmasın.
  //
  // Schema: price_snapshots.unit_price = numeric(14, 2). Scraper raw değerleri (örn.
  // 68.142, JS toFixed(3) çıktısı) gönderebilir; DB 2 decimal'a yuvarlar. Karşılaştırma
  // doğru çalışsın diye scraper değerini de aynı şekilde 2 decimal'a normalize ediyoruz.
  const normalize2 = (n: number): number => Number(n.toFixed(2));
  const targetUnitPrice = normalize2(
    params.unitPriceExclVat ?? params.unitPriceWithVat,
  );
  const targetUnitPriceWithVat = normalize2(params.unitPriceWithVat);
  const targetListPrice = params.listPrice != null ? normalize2(params.listPrice) : null;

  const lastSnapshot = await supabase
    .from("price_snapshots")
    .select("unit_price")
    .eq("product_id", params.productId)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastSnapshot.error) {
    throw new ScrapeError({
      mode: "db-write-failed",
      step: "write-price-snapshot-check",
      details: lastSnapshot.error.message,
    });
  }

  if (
    lastSnapshot.data !== null &&
    lastSnapshot.data.unit_price !== null &&
    Number(lastSnapshot.data.unit_price) === targetUnitPrice
  ) {
    // Aynı fiyat — snapshot eklenmez (idempotent)
    return { snapshotId: null, inserted: false };
  }

  const insert = await supabase
    .from("price_snapshots")
    .insert({
      product_id: params.productId,
      captured_at: params.capturedAt ?? new Date().toISOString(),
      unit_price: targetUnitPrice,
      unit_price_with_vat: targetUnitPriceWithVat,
      list_price: targetListPrice,
      discount_text: params.discountText ?? null,
      vat_rate: params.vatRate ?? null,
      source: params.source ?? "catalog",
    })
    .select("id")
    .single();

  if (insert.error || !insert.data) {
    throw new ScrapeError({
      mode: "db-write-failed",
      step: "write-price-snapshot",
      details: insert.error?.message ?? "unknown",
    });
  }

  return { snapshotId: insert.data.id, inserted: true };
}

/**
 * 015: Catalog scrape başarı path'i. Ürün için tüm failure-tracking alanlarını
 * resetler ve `tracking_enabled=true` yapar (disabled idiyse de auto-enable).
 * Sadece state değişiyorsa update atar (gereksiz DB yazımını önler).
 */
export async function recordCatalogSuccess(productId: string): Promise<void> {
  const supabase = getServiceClient();
  const current = await supabase
    .from("products")
    .select("tracking_enabled, consecutive_failure_days, last_failure_day, disabled_at")
    .eq("id", productId)
    .maybeSingle();
  if (current.error || !current.data) return;
  const needsReset =
    !current.data.tracking_enabled ||
    current.data.consecutive_failure_days > 0 ||
    current.data.last_failure_day !== null ||
    current.data.disabled_at !== null;
  if (!needsReset) return;
  await supabase
    .from("products")
    .update({
      tracking_enabled: true,
      consecutive_failure_days: 0,
      last_failure_day: null,
      disabled_at: null,
    })
    .eq("id", productId);
}

/**
 * 015: Catalog scrape başarısızlık path'i. Aynı gün içindeki çoklu fail counter'ı
 * artırmaz. 3. ardışık başarısız günde `tracking_enabled=false` yapılır.
 * Dönüş: { alreadyDisabled } — true ise hata "stale" kategorisinde sayılır
 * (status badge'i etkilemez).
 */
export async function recordCatalogFailure(
  supplierId: string,
  productCode: string,
): Promise<{ alreadyDisabled: boolean; justDisabled: boolean }> {
  const supabase = getServiceClient();
  const product = await supabase
    .from("products")
    .select("id, tracking_enabled, consecutive_failure_days, last_failure_day")
    .eq("supplier_id", supplierId)
    .eq("code", productCode)
    .maybeSingle();
  if (product.error || !product.data) {
    return { alreadyDisabled: false, justDisabled: false };
  }
  if (!product.data.tracking_enabled) {
    // Zaten disabled — counter dokunma (gereksiz).
    return { alreadyDisabled: true, justDisabled: false };
  }
  const today = istanbulToday();
  if (product.data.last_failure_day === today) {
    // Aynı günde tekrar fail — counter artmaz.
    return { alreadyDisabled: false, justDisabled: false };
  }
  const newCount = (product.data.consecutive_failure_days ?? 0) + 1;
  const updates: Database["public"]["Tables"]["products"]["Update"] = {
    consecutive_failure_days: newCount,
    last_failure_day: today,
  };
  let justDisabled = false;
  if (newCount >= 3) {
    updates.tracking_enabled = false;
    updates.disabled_at = new Date().toISOString();
    justDisabled = true;
  }
  await supabase.from("products").update(updates).eq("id", product.data.id);
  return { alreadyDisabled: false, justDisabled };
}

function istanbulToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
