# Data Model — Schema Changes + UI Projections

**Feature**: 006-price-changes-dashboard | **Tarih**: 2026-05-17

Bu doküman: (a) gerekli DB schema değişiklikleri, (b) UI projection tipleri, (c) sorgu pattern'ları, (d) format helper sözleşmeleri.

---

## 1. Schema değişiklikleri

### 1.1 `products` tablosu — `vat_rate` kolonu ekleniyor

**Mevcut** (003'ten):
```sql
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id),
  code text NOT NULL,
  name text NOT NULL,
  brand text,
  unit text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, code)
);
```

**Migration `20260517XXXXXX_add_vat_rate_to_products.sql`**:
```sql
ALTER TABLE public.products
  ADD COLUMN vat_rate numeric(5,4) NOT NULL DEFAULT 0.20
    CHECK (vat_rate >= 0 AND vat_rate <= 1);

COMMENT ON COLUMN public.products.vat_rate IS
  'Ürün başına KDV oranı (örn. 0.20 = %20). Catalog scrape''ten parse edilir.';
```

- `DEFAULT 0.20`: TR'de en yaygın oran; mevcut satırlar dolduruluyor.
- `CHECK`: 0-1 aralığı (0.01 = %1, 0.20 = %20).
- 4 ondalık: nadir özel oranlar için (ör. 0.0825 = %8,25) tampon.

### 1.2 `price_snapshots` tablosu — KDV-aware kolonlar

**Mevcut** (003'ten):
```sql
CREATE TABLE public.price_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  observed_at timestamptz NOT NULL,
  unit_price numeric(10,2) NOT NULL,
  currency text NOT NULL DEFAULT 'TRY',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX price_snapshots_product_id_observed_at_idx
  ON public.price_snapshots (product_id, observed_at DESC);
```

**Migration `20260517XXXXXX_extend_price_snapshots_with_components.sql`**:
```sql
ALTER TABLE public.price_snapshots
  ADD COLUMN unit_price_with_vat numeric(10,2),    -- KDV dahil özel birim fiyat (canonical tracking)
  ADD COLUMN list_price numeric(10,2),              -- referans (audit), nullable
  ADD COLUMN discount_text text,                    -- ör. "+40%+12%" (referans), nullable
  ADD COLUMN vat_rate numeric(5,4),                 -- snapshot anındaki KDV oranı
  ADD COLUMN source text NOT NULL DEFAULT 'catalog'
    CHECK (source IN ('catalog', 'order'));

COMMENT ON COLUMN public.price_snapshots.unit_price_with_vat IS
  'KDV dahil özel birim fiyat — alarm karşılaştırmaları bu kolon üzerinden yapılır.';
COMMENT ON COLUMN public.price_snapshots.unit_price IS
  'KDV hariç net özel fiyat (referans). 006''dan itibaren unit_price_with_vat canonical.';
```

**Notlar**:
- `unit_price_with_vat NOT NULL` istemiyoruz şu an çünkü 003 mevcut satırlar (varsa) için NULL kalır; backfill scripti olmadan zorla yapamayız.
- Gerçekte 003'te şu an `price_snapshots` boş (sipariş scrape bu tabloya yazmıyor); migration güvenli.
- `source = 'catalog'` default: yeni catalog scrape kayıtları için. `source = 'order'` ileride sipariş scrape'i bu tabloya da yazarsa.
- Index zaten product + observed_at sıralı → `get_price_changes` RPC için yeterli.

### 1.3 RPC fonksiyonu — `get_price_changes`

**Migration `20260517XXXXXX_create_get_price_changes_rpc.sql`**:
```sql
CREATE OR REPLACE FUNCTION public.get_price_changes(
  window_days int DEFAULT 7,
  include_drops boolean DEFAULT false
)
RETURNS TABLE (
  product_id uuid,
  supplier_slug text,
  product_code text,
  product_name text,
  brand text,
  old_price numeric,
  new_price numeric,
  old_observed_at timestamptz,
  new_observed_at timestamptz,
  change_pct numeric,
  change_amount numeric,
  last_order_id uuid,
  last_order_no text,
  last_order_at timestamptz
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH window_snapshots AS (
    SELECT
      ps.product_id,
      ps.observed_at,
      ps.unit_price_with_vat AS price,
      ROW_NUMBER() OVER (PARTITION BY ps.product_id ORDER BY ps.observed_at DESC) AS rn_desc,
      ROW_NUMBER() OVER (PARTITION BY ps.product_id ORDER BY ps.observed_at ASC)  AS rn_asc
    FROM public.price_snapshots ps
    WHERE ps.observed_at >= now() - (window_days || ' days')::interval
      AND ps.unit_price_with_vat IS NOT NULL
  ),
  latest AS (
    SELECT product_id, observed_at, price FROM window_snapshots WHERE rn_desc = 1
  ),
  oldest AS (
    SELECT product_id, observed_at, price FROM window_snapshots WHERE rn_asc = 1
  ),
  last_orders AS (
    SELECT DISTINCT ON (oi.product_id)
      oi.product_id, so.id AS order_id, so.order_no, so.ordered_at
    FROM public.order_items oi
    JOIN public.supplier_orders so ON so.id = oi.order_id
    WHERE oi.product_id IS NOT NULL
    ORDER BY oi.product_id, so.ordered_at DESC
  )
  SELECT
    p.id,
    s.slug,
    p.code,
    p.name,
    p.brand,
    o.price AS old_price,
    l.price AS new_price,
    o.observed_at AS old_observed_at,
    l.observed_at AS new_observed_at,
    CASE WHEN o.price > 0
      THEN round(((l.price - o.price) / o.price)::numeric, 4)
      ELSE NULL
    END AS change_pct,
    round((l.price - o.price)::numeric, 2) AS change_amount,
    lo.order_id, lo.order_no, lo.ordered_at
  FROM latest l
  JOIN oldest o ON o.product_id = l.product_id
  JOIN public.products p ON p.id = l.product_id
  JOIN public.suppliers s ON s.id = p.supplier_id
  LEFT JOIN last_orders lo ON lo.product_id = l.product_id
  WHERE l.observed_at > o.observed_at      -- en az 2 snapshot pencerede
    AND (
      (include_drops = false AND l.price > o.price)
      OR (include_drops = true AND l.price <> o.price)
    )
  ORDER BY change_pct DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_price_changes(int, boolean)
  TO authenticated, service_role;
```

**Test SQL** (manual):
```sql
SELECT * FROM public.get_price_changes(7, false) LIMIT 10;
SELECT * FROM public.get_price_changes(30, true) LIMIT 10;
```

### 1.4 `order_items.product_id` FK kontrolü

003 schema'ya bakılır: `order_items.product_id uuid REFERENCES products(id)` var mı? Eğer:
- **Var ve dolu**: hiçbir şey yapmıyoruz.
- **Var ama NULL**: 004 scraper update'i + backfill — catalog scrape sırasında `product_code` → `products.id` lookup ile `order_items.product_id` doldur (yan etki migration veya scraper içinde).
- **Yok**: migration ile eklenir.

Bu kontrol implementation'da T002'de (Phase 1 setup) yapılır.

---

## 2. UI Projection tipleri

### 2.1 `PriceChangeRow` (zamlanan ürünler listesi)

```ts
export type PriceChangeRow = {
  productId: string;
  supplierSlug: string;
  productCode: string;
  productName: string;
  brand: string | null;
  oldPrice: number;            // KDV dahil
  newPrice: number;            // KDV dahil
  oldObservedAt: string;       // ISO
  newObservedAt: string;       // ISO
  changePct: number | null;    // null = oldPrice 0; örn. 0.125 = +%12,5
  changeAmount: number;        // +veya- (₺)
  lastOrderId: string | null;
  lastOrderNo: string | null;
  lastOrderAt: string | null;
};
```

**SQL kaynağı**: `get_price_changes(window_days, include_drops)` RPC çıktısı; tip dönüşümü ile JS shape'e map edilir.

### 2.2 `ProductSummary` (ürün detay header)

```ts
export type ProductSummary = {
  id: string;
  code: string;
  name: string;
  brand: string | null;
  supplierSlug: string;
  supplierName: string;
  vatRate: number;             // 0.20 = %20
  currentUnitPriceWithVat: number | null;   // son snapshot
  currentObservedAt: string | null;
};
```

### 2.3 `ProductSnapshot` (tarihçe satırı)

```ts
export type ProductSnapshot = {
  id: string;
  observedAt: string;
  unitPriceWithVat: number;     // canonical
  unitPriceExclVat: number | null;  // referans
  listPrice: number | null;
  discountText: string | null;
  vatRate: number | null;       // snapshot anındaki oran (NULL eski kayıtlar için)
  source: 'catalog' | 'order';
  // Computed (önceki snapshot'a göre değişim):
  changeFromPrevAmount: number | null;  // null = ilk snapshot
  changeFromPrevPct: number | null;
};
```

`changeFromPrev*` SQL pencere fonksiyonuyla query'de hesaplanır:

```sql
SELECT ps.*,
  ps.unit_price_with_vat - LAG(ps.unit_price_with_vat) OVER w AS change_from_prev_amount,
  CASE WHEN LAG(ps.unit_price_with_vat) OVER w > 0
    THEN (ps.unit_price_with_vat - LAG(ps.unit_price_with_vat) OVER w)
         / LAG(ps.unit_price_with_vat) OVER w
    ELSE NULL END AS change_from_prev_pct
FROM public.price_snapshots ps
WHERE ps.product_id = $1
WINDOW w AS (PARTITION BY ps.product_id ORDER BY ps.observed_at ASC)
ORDER BY ps.observed_at DESC;
```

### 2.4 `ProductOrderHistoryItem` (ürünün geçtiği siparişler)

```ts
export type ProductOrderHistoryItem = {
  orderId: string;
  orderNo: string;
  orderedAt: string;
  quantity: number;
  unitPriceAtOrder: number;     // KDV hariç (005 ile aynı)
  lineTotal: number;            // qty × unitPrice (KDV hariç)
  supplierSlug: string;
  supplierName: string;
};
```

SQL: `order_items` JOIN `supplier_orders` JOIN `suppliers` WHERE `oi.product_id = $1` ORDER BY `so.ordered_at DESC`.

### 2.5 `PriceChangesFilterState`

```ts
export type PriceChangesFilterState = {
  windowDays: number;          // default 7
  includeDrops: boolean;       // default false
};
```

**zod schema** (`lib/validations/price-changes-filter.ts`):

```ts
import { z } from "zod";

export const priceChangesFilterSchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(),
  showDrops: z.enum(["1", "0"]).optional(),
});

export function parsePriceChangesFilter(
  sp: URLSearchParams | Record<string, string | string[] | undefined>
): PriceChangesFilterState {
  const obj = sp instanceof URLSearchParams ? Object.fromEntries(sp) : sp;
  const r = priceChangesFilterSchema.safeParse({
    days: typeof obj.days === "string" ? obj.days : undefined,
    showDrops: typeof obj.showDrops === "string" ? obj.showDrops : undefined,
  });
  if (!r.success) return { windowDays: 7, includeDrops: false };
  return {
    windowDays: r.data.days ?? 7,
    includeDrops: r.data.showDrops === "1",
  };
}
```

### 2.6 `SparklinePoint`

```ts
export type SparklinePoint = {
  observedAt: string;
  price: number;       // unitPriceWithVat
};
```

Sparkline component'i `SparklinePoint[]` alır; min ≥ 2 nokta ise SVG polyline render eder, < 2 ise `<span>—</span>`.

---

## 3. Format helper sözleşmeleri (yeni)

### `lib/format/percent.ts`

```ts
/**
 * Returns: "+%12,5", "-%3,2", "%0", veya boş string (null → '—')
 * 0.125 → "+%12,5"
 * -0.032 → "-%3,2"
 * 0 → "%0"
 * null/undefined → "—"
 */
export function formatTrPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value === 0) return "%0";
  const pct = value * 100;
  const sign = pct > 0 ? "+" : "-";
  const abs = Math.abs(pct);
  const formatted = abs.toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `${sign}%${formatted}`;
}
```

Test örnekleri:
- `formatTrPercent(0.125)` → `"+%12,5"`
- `formatTrPercent(-0.0825)` → `"-%8,25"`
- `formatTrPercent(0)` → `"%0"`
- `formatTrPercent(null)` → `"—"`

`formatTry` ve `formatTrDate` 005'ten reuse — değişmez.

---

## 4. `lib/constants/price-changes.ts`

```ts
export const DEFAULT_DAYS_WINDOW = 7;
export const MAX_DAYS_WINDOW = 365;
export const MIN_DAYS_WINDOW = 1;
export const DAYS_PRESETS = [7, 14, 30, 90] as const;
```

UI'da `WindowFilter` dropdown bu preset'leri kullanır + "özel" seçeneği (URL elle yazılırsa kabul eder).

---

## 5. Mevcut + yeni DB tabloları matrisi

| Tablo | Değişiklik | Notlar |
|-------|------------|--------|
| `suppliers` | yok | (003) |
| `supplier_orders` | yok | (003, 004) |
| `order_items` | (kontrol) `product_id` FK var mı? | Yoksa migration |
| `products` | `vat_rate` eklendi | NUMERIC(5,4) NOT NULL DEFAULT 0.20 |
| `price_snapshots` | 5 kolon eklendi | unit_price_with_vat, list_price, discount_text, vat_rate, source |
| `scrape_runs` | yok | (004 audit reuse) |

Yeni RPC: `get_price_changes(window_days int, include_drops boolean)`.

---

## 6. RLS politikaları doğrulaması

| Tablo | SELECT policy | INSERT/UPDATE/DELETE |
|-------|---------------|----------------------|
| `products` | `(select auth.uid()) IS NOT NULL` (003) | Sadece service_role (scraper) |
| `price_snapshots` | `(select auth.uid()) IS NOT NULL` (003) | Sadece service_role (scraper) |
| Yeni kolonlar | otomatik kapsam dahilinde (Postgres row-level) | aynı |

Migration sonrası `mcp__supabase__get_advisors({ type: "security" })` ile doğrula — yeni RLS warning olmamalı.

---

## 7. Veri akışı (özet)

```
1. npm run scrape:catalog -- --supplier enderyapi --limit 20
        ↓
2. catalog.ts orchestrator → loadAdapter('enderyapi')
        ↓
3. login (Playwright) → page session shared
        ↓
4. listProductCodes()  ← önce 'products' tablosundan + son N gün siparişten bilinen kodlar
        ↓
5. for each code: adapter.scrapeCatalog([code])
        - navigate to catalog detail
        - parse list_price, discount_text, unit_price_excl_vat, vat_rate
        - compute unit_price_with_vat = excl × (1 + vat_rate)
        ↓
6. supabase-writer.writePriceSnapshot({ product_id, observed_at: now, ... })
        ↓
7. price_snapshots INSERT (yeni satır her seferinde)
        ↓
8. UI /dashboard/price-changes → get_price_changes(7) RPC
        ↓
9. PriceChangeTable render
```
