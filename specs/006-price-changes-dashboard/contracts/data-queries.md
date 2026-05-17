# Contract — Data Query API

**Feature**: 006-price-changes-dashboard | **Tarih**: 2026-05-17

İki yeni data layer modülü: `lib/queries/price-changes.ts` ve `lib/queries/products.ts`. Tümü RLS-respecting `createClient()` (server) ile çalışır.

## Public API

```ts
// lib/queries/price-changes.ts
import type { PriceChangeRow, PriceChangesFilterState } from "./types";
export async function listPriceChanges(
  filter: PriceChangesFilterState
): Promise<PriceChangeRow[]>;

// lib/queries/products.ts
import type {
  ProductSummary,
  ProductSnapshot,
  ProductOrderHistoryItem,
} from "./types";
export async function getProductById(id: string): Promise<ProductSummary | null>;
export async function listProductSnapshots(productId: string): Promise<ProductSnapshot[]>;
export async function listProductOrders(productId: string): Promise<ProductOrderHistoryItem[]>;
```

Tipler [data-model.md](../data-model.md) §2'de tanımlandı.

## 1. `listPriceChanges(filter)`

**Behavior**: Supabase RPC `get_price_changes` çağırır; sonuçları `PriceChangeRow[]` shape'ine map eder.

**Implementation**:

```ts
import { createClient } from "@/lib/supabase/server";
import type { PriceChangeRow, PriceChangesFilterState } from "./types";

export async function listPriceChanges(
  filter: PriceChangesFilterState
): Promise<PriceChangeRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_price_changes", {
    window_days: filter.windowDays,
    include_drops: filter.includeDrops,
  });
  if (error) throw new Error(`listPriceChanges failed: ${error.message}`);
  return (data ?? []).map(toPriceChangeRow);
}

function toPriceChangeRow(r: GetPriceChangesRow): PriceChangeRow {
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
```

`GetPriceChangesRow` tipi `Database['public']['Functions']['get_price_changes']['Returns']` üzerinden generate edilir (RPC tipini Supabase generate types yakalar).

**Error**: `error.tsx` boundary'ye bırak. Empty result → boş array; caller empty state render.

## 2. `getProductById(id)`

**Behavior**: `products` JOIN `suppliers` + son snapshot.

```ts
export async function getProductById(
  id: string
): Promise<ProductSummary | null> {
  const supabase = await createClient();
  const { data: product, error } = await supabase
    .from("products")
    .select(`
      id, code, name, brand, vat_rate,
      supplier:suppliers!inner ( slug, name )
    `)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getProductById failed: ${error.message}`);
  if (!product) return null;

  // Son snapshot (varsa)
  const { data: snap } = await supabase
    .from("price_snapshots")
    .select("unit_price_with_vat, observed_at")
    .eq("product_id", id)
    .not("unit_price_with_vat", "is", null)
    .order("observed_at", { ascending: false })
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
    currentUnitPriceWithVat: snap ? Number(snap.unit_price_with_vat) : null,
    currentObservedAt: snap?.observed_at ?? null,
  };
}
```

**Caller pattern** (`app/(app)/dashboard/products/[id]/page.tsx`):

```tsx
import { notFound } from "next/navigation";

export default async function ProductDetailPage({ params }: Props) {
  const { id } = await params;
  const product = await getProductById(id);
  if (!product) notFound();
  const [snapshots, orders] = await Promise.all([
    listProductSnapshots(id),
    listProductOrders(id),
  ]);
  return <ProductDetailLayout product={product} snapshots={snapshots} orders={orders} />;
}
```

## 3. `listProductSnapshots(productId)`

**Behavior**: Tek ürünün tüm snapshot'larını DESC sırala; her satır için bir önceki snapshot'a göre değişim hesapla (SQL pencere fonksiyonu).

```ts
export async function listProductSnapshots(
  productId: string
): Promise<ProductSnapshot[]> {
  const supabase = await createClient();
  // RPC ile pencere fonksiyonu (ek 4. migration veya inline view)
  const { data, error } = await supabase.rpc("get_product_snapshots", {
    product_id_input: productId,
  });
  if (error) throw new Error(`listProductSnapshots failed: ${error.message}`);
  return (data ?? []).map(toProductSnapshot);
}
```

**Alternatif (RPC yerine inline)**: Eğer ek RPC eklemek istemiyorsak, tüm snapshot'ları çek, JS'te `Array.map` ile prev karşılaştırması yap:

```ts
const { data } = await supabase
  .from("price_snapshots")
  .select("*")
  .eq("product_id", productId)
  .order("observed_at", { ascending: true });

const withChange = data!.map((curr, i, arr) => {
  const prev = i > 0 ? arr[i - 1] : null;
  const prevPrice = prev?.unit_price_with_vat ?? null;
  return {
    ...curr,
    changeFromPrevAmount: prevPrice !== null
      ? Number((curr.unit_price_with_vat - prevPrice).toFixed(2))
      : null,
    changeFromPrevPct: prevPrice !== null && prevPrice > 0
      ? (curr.unit_price_with_vat - prevPrice) / prevPrice
      : null,
  };
}).reverse();  // DESC çıkış için
```

**Decision**: V1'de **JS hesabı tercih** — RPC çoğaltmıyoruz (G13 tek RPC yeter; inline pattern yeterli, snapshot sayısı ürün başına orta ölçek).

## 4. `listProductOrders(productId)`

**Behavior**: `order_items` (product_id eşleşen) JOIN `supplier_orders` JOIN `suppliers`, en yeni başta.

```ts
export async function listProductOrders(
  productId: string
): Promise<ProductOrderHistoryItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("order_items")
    .select(`
      id, quantity, unit_price_at_order,
      order:supplier_orders!inner (
        id, order_no, ordered_at,
        supplier:suppliers!inner ( slug, name )
      )
    `)
    .eq("product_id", productId)
    .order("ordered_at", { ascending: false, referencedTable: "supplier_orders" });
  if (error) throw new Error(`listProductOrders failed: ${error.message}`);

  return (data ?? []).map((r) => {
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
```

**Edge cases**:
- `order_items.product_id` NULL ise → bu ürün hiçbir siparişe linkli değil → empty array.
- Aynı ürün aynı siparişte 2 ayrı satır olabilir mi? Şu an scraper buna izin vermiyor (product_code unique per order varsayımı); ama olursa iki satır göster.

## 5. RPC tipini tipize et: `Database['Functions']`

Migration sonrası `npx supabase gen types typescript ...` ile `lib/supabase/database.types.ts` yenilenir. Yeni RPC: `Database['public']['Functions']['get_price_changes']['Args']` + `Returns`. Bu otomatik olur (003 deseniyle aynı).

## 6. Error handling stratejisi

- Tüm fonksiyonlar throw Error; caller (page.tsx) try/catch yapmaz.
- Next.js `error.tsx` boundary (yoksa default) yakalar.
- V2'de feature-specific `app/(app)/dashboard/price-changes/error.tsx` eklenebilir.

## 7. Auth context

- Tüm queries `createClient()` (server) ile çalışır → cookie session → authenticated user.
- RLS satırları filtreler (003 policy: `(select auth.uid()) IS NOT NULL`).
- `service_role` UI'da kullanılmaz; scraper'da kullanılır (ayrı `lib/scraper/supabase-writer.ts` ile, 004 deseni).

## 8. Edge cases tablosu

| Senaryo | Davranış |
|---------|----------|
| Hiç snapshot yok | RPC empty array; UI empty state "yeterli geçmiş yok" |
| Pencerede tek snapshot (karşılaştırma yok) | RPC empty array; UI empty state "yeterli geçmiş yok" |
| Pencerede 2+ snapshot ama değişiklik yok | RPC empty array; UI empty state "fiyat değişikliği yok" |
| `days=0` veya negative | zod fail → default 7'e fallback |
| `days > 365` | zod fail → default 7'e fallback |
| Geçersiz UUID `/products/<id>` | Postgres error → error.tsx |
| Var olmayan UUID | `null` → `notFound()` |
| `order_items.product_id` NULL | listProductOrders empty array; UI "henüz sipariş edilmemiş" |
| Eski snapshot `unit_price_with_vat NULL` | RPC `WHERE` filtresi atlar; UI tarihçesinde gözükmez (V1) |
