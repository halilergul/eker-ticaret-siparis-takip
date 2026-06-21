# RPC Contract: `get_price_changes_v2`

**Feature**: 012 — Zamlanan Ürünler (son sipariş bazlı)
**Date**: 2026-06-20

---

## Endpoint

PostgREST RPC, Supabase JS client tarafında:

```typescript
supabase.rpc("get_price_changes_v2", {
  filter_supplier_slug: string | null,
  filter_min_change_pct: number,   // 0..1 (örn. 0.05 = %5)
  sort_by: "change_pct" | "change_amount" | "days_since" | "last_ordered_at",
});
```

---

## Input

| Param | Type | Default | Validation |
|-------|------|---------|------------|
| `filter_supplier_slug` | text \| null | NULL | `^[a-z0-9-]+$` veya null |
| `filter_min_change_pct` | numeric | 0 | 0 ≤ value ≤ 5.0 (zod ile UI'da clamp) |
| `sort_by` | text | `change_pct` | enum 4 değer |

---

## Output

Her satır:

| Field | Type | Nullable | Notes |
|-------|------|----------|-------|
| `product_id` | uuid | no | |
| `supplier_slug` | text | no | |
| `supplier_name` | text | no | |
| `product_code` | text | no | |
| `product_name` | text | no | |
| `brand` | text | yes | |
| `last_order_price_excl_vat` | numeric | no | KDV hariç |
| `last_ordered_at` | timestamptz | no | ISO 8601 UTC |
| `last_order_no` | text | no | |
| `days_since_last_order` | integer | no | gün sayısı (now() - last_ordered_at) |
| `current_price_excl_vat` | numeric | **yes** | Snapshot yoksa NULL |
| `current_price_captured_at` | timestamptz | **yes** | Snapshot yoksa NULL |
| `change_pct` | numeric | **yes** | Snapshot yoksa veya eski ise NULL |
| `change_amount` | numeric | **yes** | Snapshot yoksa veya eski ise NULL |

---

## Davranış sözleşmesi

### MUST

1. **Yalnız sipariş edilmiş ürünleri döndürür**: ürün için `last_orders` CTE'sinde kayıt olmalı (yani `order_items.product_id` ile en az 1 eşleşme).
2. **Sadece zamlananları içerir**: `current_price > last_order_price` (NULL snapshot durumu istisna — aşağıda).
3. **NULL snapshot durumu** (`current_price IS NULL`):
   - Satır listede görünür **EĞER** `filter_min_change_pct = 0` (default).
   - Satır listede **görünmez** **EĞER** `filter_min_change_pct > 0` (yüzdesi yok).
4. **Eski snapshot durumu** (`current_captured_at < last_ordered_at`):
   - `current_price_excl_vat` ve `current_price_captured_at` döner ama `change_pct` + `change_amount` NULL.
   - WHERE clause bu satırları zaten `current > last` koşulundan dolayı düşürür (snapshot kullanılmıyor).
5. **Tedarikçi filtresi**: `filter_supplier_slug IS NULL` → tüm tedarikçiler; aksi halde exact match `suppliers.slug`.
6. **Min change filter**: `filter_min_change_pct = 0.05` → satırlar `change_pct >= 0.05` olanlar.
7. **Sıralama**: `sort_by` 4 değer tek seferde aktif; diğer sıralama clause'ları no-op.

### SHOULD

1. **NULL handling sıralamada**: `change_pct = NULL` satırlar en sona (NULLS LAST).
2. **Eşit zam %**: Tie-breaker `change_amount DESC` (büyük TL fark önce).

### MUST NOT

1. **`include_drops` parametresi yok** (V1 anti-goal: düşüşler kapsamı dışı).
2. **`window_days` parametresi yok** (feature ana motivasyon).
3. **Cross-supplier eşleşmesi yok** (010 anti-goal).
4. **Yan etki yok**: salt-okunur function, INSERT/UPDATE yok.

---

## Migration

Dosya: `supabase/migrations/20260620100000_get_price_changes_v2.sql`

```sql
-- Eski function temizliği
DROP FUNCTION IF EXISTS public.get_price_changes(integer, boolean);

-- Yeni function
CREATE OR REPLACE FUNCTION public.get_price_changes_v2(
  filter_supplier_slug text DEFAULT NULL,
  filter_min_change_pct numeric DEFAULT 0,
  sort_by text DEFAULT 'change_pct'
) RETURNS TABLE(...) ...;

GRANT EXECUTE ON FUNCTION public.get_price_changes_v2 TO authenticated;
```

**Note**: `SECURITY DEFINER` yok (mevcut RLS policies yeterli; tablolar zaten read-allowed authenticated user için).

---

## Caller (TypeScript)

`lib/queries/price-changes.ts`:

```typescript
export async function listPriceChanges(
  filter: PriceChangesFilterState,
): Promise<PriceComparisonRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_price_changes_v2", {
    filter_supplier_slug: filter.supplierSlug ?? null,
    filter_min_change_pct: filter.minChangePct ?? 0,
    sort_by: filter.sortBy ?? "change_pct",
  });
  if (error) throw new Error(`listPriceChanges failed: ${error.message}`);
  return (data ?? []).map(toRow);
}
```

---

## Test stratejisi (manuel)

1. **Smoke**: Lokal Next.js dev server + tarayıcıda `/dashboard/zamlanan-urunler`.
2. **DB doğrulama** Supabase SQL'den manuel RPC çağırma:
   ```sql
   SELECT * FROM public.get_price_changes_v2(NULL, 0, 'change_pct');
   ```
3. **Beklenen**: Mevcut 269 sipariş × 4 tedarikçi'den ürün eşleşmiş olanların zamlanan kısmı (~tahmini 30-80 satır).
4. **Filtre testleri**:
   - `?supplier=yedekler` → sadece Yedekler ürünleri.
   - `?min=5` → ≥%5 zammı olanlar.
   - Default (filtre yok) → tüm zamlananlar + snapshot eksik olanlar.

---

## Backwards compatibility

- Eski `get_price_changes(integer, boolean)` drop edilir.
- Tek caller (`lib/queries/price-changes.ts`) güncellenir.
- Vercel auto-deploy migration ile birlikte gider; race condition yok (migration önce, code sonra deploy edilirse 1-2 saniye 404; iki yönde de küçük etki).

**Pratik akış**: PR merge → migration uygulanır → Vercel deploy (~30sn). Bu sürede sayfa kısmen broken olabilir. Production trafiği tek kullanıcı → kabul edilebilir.
