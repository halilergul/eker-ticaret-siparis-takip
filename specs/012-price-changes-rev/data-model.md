# Data Model — Phase 1

**Feature**: Zamlanan Ürünler — Son Sipariş Bazlı Birikimli Zam Takibi
**Date**: 2026-06-20

---

## Genel

Bu feature **DB şeması değiştirmez**. Yeni tablo, yeni kolon, yeni constraint yok. Sadece yeni SQL function eklenir, eski function drop edilir.

---

## Mevcut Entity'ler (değişmez)

### `products`

| Sütun | Tip | Notes |
|-------|-----|-------|
| `id` | uuid PK | — |
| `supplier_id` | uuid FK | — |
| `code` | text | tedarikçi başına unique |
| `name` | text | — |
| `brand` | text NULL | — |
| `barcode` | text NULL | 009 fallback |
| `last_seen_at` | timestamptz | — |
| `catalog_url` | text NULL | — |

### `supplier_orders`

| Sütun | Tip |
|-------|-----|
| `id` | uuid PK |
| `supplier_id` | uuid FK |
| `order_no` | text |
| `ordered_at` | timestamptz |
| `status` | text |

### `order_items`

| Sütun | Tip | Notes |
|-------|-----|-------|
| `id` | uuid PK | — |
| `order_id` | uuid FK → supplier_orders | — |
| `product_id` | uuid FK NULL | NULL olabilir (henüz eşleşmemiş) |
| `product_code` | text | — |
| `product_name` | text | — |
| `quantity` | numeric | — |
| `unit_price_at_order` | numeric | **KDV hariç net** — feature anahtar girdisi |

### `price_snapshots`

| Sütun | Tip | Notes |
|-------|-----|-------|
| `id` | uuid PK | — |
| `product_id` | uuid FK | — |
| `captured_at` | timestamptz | — |
| `unit_price` | numeric | **KDV hariç net** — feature anahtar girdisi |
| `unit_price_with_vat` | numeric | bilgilendirme amaçlı, kullanılmaz |
| `vat_rate` | numeric | bilgilendirme |
| `source` | text | "catalog" / "manual" |

### `suppliers`

| Sütun | Tip |
|-------|-----|
| `id` | uuid PK |
| `slug` | text |
| `name` | text |

---

## Yeni Görüntüleme Tipleri (kod tarafı)

### `PriceComparisonRow` (TypeScript görüntüleme)

```typescript
type PriceComparisonRow = {
  productId: string;
  supplierSlug: string;
  supplierName: string;
  productCode: string;
  productName: string;
  brand: string | null;

  // Son alış (her zaman dolu — listenin precondition'ı sipariş geçmişi olması)
  lastOrderPriceExclVat: number;       // unit_price_at_order
  lastOrderedAt: string;                // ISO 8601 UTC
  lastOrderNo: string;
  daysSinceLastOrder: number;          // integer (days)

  // Bugünkü fiyat (snapshot yoksa null)
  currentPriceExclVat: number | null;
  currentPriceCapturedAt: string | null;

  // Delta (snapshot yoksa null)
  changePct: number | null;            // -1.0..1.0 (numeric ratio)
  changeAmount: number | null;         // TL fark (positive = zam)
};
```

### `PriceChangesFilterState`

```typescript
type PriceChangesFilterState = {
  supplierSlug?: string;               // undefined = tüm tedarikçiler
  minChangePct?: number;                // 0.05 (5%), 0.10, 0.25, 0.50; undefined = 0
  sortBy?: "change_pct" | "change_amount" | "days_since" | "last_ordered_at";
  // include_drops kaldırıldı (V1 anti-goal)
  // windowDays kaldırıldı (feature ana motivasyon)
};
```

---

## SQL Function: `get_price_changes_v2`

### İmza

```sql
CREATE OR REPLACE FUNCTION public.get_price_changes_v2(
  filter_supplier_slug text DEFAULT NULL,
  filter_min_change_pct numeric DEFAULT 0,
  sort_by text DEFAULT 'change_pct'
)
RETURNS TABLE(
  product_id uuid,
  supplier_slug text,
  supplier_name text,
  product_code text,
  product_name text,
  brand text,
  last_order_price_excl_vat numeric,
  last_ordered_at timestamptz,
  last_order_no text,
  days_since_last_order integer,
  current_price_excl_vat numeric,        -- NULL olabilir
  current_price_captured_at timestamptz, -- NULL olabilir
  change_pct numeric,                     -- NULL olabilir
  change_amount numeric                    -- NULL olabilir
)
LANGUAGE sql
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH last_orders AS (
    SELECT DISTINCT ON (oi.product_id)
      oi.product_id,
      oi.unit_price_at_order AS last_price,
      so.ordered_at AS last_ordered_at,
      so.order_no AS last_order_no
    FROM public.order_items oi
    JOIN public.supplier_orders so ON so.id = oi.order_id
    WHERE oi.product_id IS NOT NULL
    ORDER BY oi.product_id, so.ordered_at DESC
  ),
  latest_snapshots AS (
    SELECT DISTINCT ON (ps.product_id)
      ps.product_id,
      ps.unit_price AS current_price,
      ps.captured_at AS current_captured_at
    FROM public.price_snapshots ps
    WHERE ps.unit_price IS NOT NULL
    ORDER BY ps.product_id, ps.captured_at DESC
  )
  SELECT
    p.id,
    s.slug,
    s.name,
    p.code,
    p.name,
    p.brand,
    lo.last_price,
    lo.last_ordered_at,
    lo.last_order_no,
    EXTRACT(DAY FROM (now() - lo.last_ordered_at))::integer,
    ls.current_price,
    ls.current_captured_at,
    -- Snapshot snap'i son alıştan ÖNCE ise kullanılmaz (R-004)
    CASE
      WHEN ls.current_price IS NULL OR ls.current_captured_at < lo.last_ordered_at THEN NULL
      WHEN lo.last_price > 0 THEN round(((ls.current_price - lo.last_price) / lo.last_price)::numeric, 4)
      ELSE NULL
    END,
    CASE
      WHEN ls.current_price IS NULL OR ls.current_captured_at < lo.last_ordered_at THEN NULL
      ELSE round((ls.current_price - lo.last_price)::numeric, 2)
    END
  FROM public.products p
  JOIN public.suppliers s ON s.id = p.supplier_id
  JOIN last_orders lo ON lo.product_id = p.id
  LEFT JOIN latest_snapshots ls ON ls.product_id = p.id
  WHERE
    (filter_supplier_slug IS NULL OR s.slug = filter_supplier_slug)
    AND (
      -- Sadece zamlananlar: current > last
      (ls.current_price IS NOT NULL AND ls.current_price > lo.last_price)
      -- Veya snapshot eksik (min filter yok ise göster)
      OR (ls.current_price IS NULL AND filter_min_change_pct = 0)
    )
    AND (
      -- Min change filter
      filter_min_change_pct = 0
      OR (
        ls.current_price IS NOT NULL
        AND lo.last_price > 0
        AND ((ls.current_price - lo.last_price) / lo.last_price) >= filter_min_change_pct
      )
    )
  ORDER BY
    CASE WHEN sort_by = 'change_pct' THEN
      CASE WHEN lo.last_price > 0 AND ls.current_price IS NOT NULL
        THEN (ls.current_price - lo.last_price) / lo.last_price
        ELSE NULL
      END
    END DESC NULLS LAST,
    CASE WHEN sort_by = 'change_amount' THEN
      CASE WHEN ls.current_price IS NOT NULL THEN ls.current_price - lo.last_price ELSE NULL END
    END DESC NULLS LAST,
    CASE WHEN sort_by = 'days_since' THEN now() - lo.last_ordered_at END DESC,
    CASE WHEN sort_by = 'last_ordered_at' THEN lo.last_ordered_at END ASC NULLS LAST
$$;
```

### Davranış kuralları

1. **Precondition**: `order_items.product_id IS NOT NULL` — ürün eşleşmiş olmalı.
2. **last_orders CTE**: Her ürün için en yeni sipariş kalemi (DISTINCT ON + ORDER BY).
3. **latest_snapshots CTE**: Her ürün için en yeni snapshot.
4. **Snapshot eski mi**: `current_captured_at < last_ordered_at` ise NULL kabul (son alış zaten karşılaştırma temeli; daha eski snapshot anlamsız).
5. **Sadece zam**: WHERE'de `current > last` filter.
6. **Snapshot eksik**: `current_price IS NULL` durumunda satır listede kalır AMA `filter_min_change_pct > 0` ise listeden düşer (yüzdesi bilinemez).
7. **Tedarikçi filtresi**: `filter_supplier_slug IS NULL` → tüm tedarikçiler.
8. **Sıralama**: `sort_by` parametresi 4 değerden biri.

### Drop eski function

```sql
DROP FUNCTION IF EXISTS public.get_price_changes(integer, boolean);
```

---

## Şema değişikliği yok — özet

| Tablo | Değişiklik |
|-------|-----------|
| products, supplier_orders, order_items, price_snapshots, suppliers | Hiçbir değişiklik |
| RLS policies | Korunur |
| Index'ler | Mevcutlar yeterli (product_id, ordered_at zaten indexed) |

---

## Performance Notları

- `order_items.product_id` + `supplier_orders.ordered_at` — bileşik index önerilir mi? Mevcut: ayrı indexler yeterli, dataset 600 satır.
- `price_snapshots.product_id` + `captured_at` DESC — DISTINCT ON için yararlı; eğer 1000+ snapshot olduğunda yavaşlarsa post-V1 partial index düşünülür.
- Beklenen RPC süresi: 250 ürün × CTE → 100-300 ms (Supabase EU-Central).
