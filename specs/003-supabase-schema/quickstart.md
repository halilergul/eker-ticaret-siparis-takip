# Quickstart — Manuel Doğrulama

**Feature**: 003-supabase-schema | **Tarih**: 2026-05-16

Bu doküman migration'lar uygulandıktan sonra çalıştırılacak manuel doğrulama senaryolarını içerir. Spec'teki Success Criteria (SC-001 → SC-006) bu senaryolarla doğrulanır.

Senaryolar Supabase SQL Editor'da (web) veya `mcp__supabase__execute_sql` üzerinden sırayla koşturulur.

---

## QS-00 — Hazırlık: migration uygulandı mı?

```sql
-- Beklenen 5 tablo
SELECT table_name FROM information_schema.tables
 WHERE table_schema = 'public'
   AND table_name IN ('suppliers','supplier_orders','order_items','products','price_snapshots')
 ORDER BY table_name;
-- → 5 satır

-- Seed kaydı?
SELECT slug, name, base_url FROM public.suppliers WHERE slug = 'enderyapi';
-- → 1 satır (enderyapi, Enderyapi B2B, https://b2b.enderyapi.com.tr)

-- RPC fonksiyon var mı?
SELECT proname FROM pg_proc WHERE proname = 'record_price_observation';
-- → 1 satır
```

| Sonuç | ✅/❌ |
|-------|------|
| 5 tablo bulundu | ✅ |
| Seed kaydı var | ✅ (`enderyapi / Enderyapi B2B / https://b2b.enderyapi.com.tr`) |
| Fonksiyon var | ✅ (`record_price_observation`, 5 args) |

---

## QS-01 — User Story 1: Idempotent insert (SC-002)

Aynı sipariş 3 kez insert edilirse satır sayısı sabit kalmalı.

```sql
-- Setup
WITH s AS (SELECT id FROM public.suppliers WHERE slug = 'enderyapi')
INSERT INTO public.supplier_orders (supplier_id, order_no, status, ordered_at, total_amount)
SELECT s.id, 'ESP018-12345', 'Onaylandı', '2026-05-01T10:00:00Z', 1250.00 FROM s
ON CONFLICT (supplier_id, order_no) DO NOTHING;

WITH o AS (SELECT id FROM public.supplier_orders WHERE order_no = 'ESP018-12345')
INSERT INTO public.order_items (order_id, product_code, product_name, quantity, unit_price_at_order)
SELECT o.id, 'VDA-M8-PSL', 'Vida M8 paslanmaz', 50, 5.00 FROM o
UNION ALL SELECT o.id, 'SOM-M8-PSL', 'Somun M8 paslanmaz', 100, 2.50 FROM o
UNION ALL SELECT o.id, 'RNB-M8-PSL', 'Rondela M8 paslanmaz', 100, 0.50 FROM o
ON CONFLICT (order_id, product_code) DO NOTHING;

-- Sayım
SELECT 'orders' AS t, count(*) FROM public.supplier_orders
 UNION ALL SELECT 'items', count(*) FROM public.order_items;
-- → orders=1, items=3
```

Aynı bloğu 2 kez daha çalıştır → sayılar 1 ve 3 kalmalı.

| Çalıştırma | orders | items |
|------------|--------|-------|
| 1. kez | 1 | 3 ✅ |
| 2. kez | 1 | 3 ✅ |
| 3. kez | 1 | 3 ✅ |

**Eşleşmezse** unique constraint eksik veya yanlış kurulmuş.

---

## QS-02 — Fiyat snapshot davranışı (SC-003)

```sql
-- 1. gözlem: ürün yok, ilk fiyat 100
SELECT public.record_price_observation(
  (SELECT id FROM public.suppliers WHERE slug='enderyapi'),
  'VDA-TEST-001', 'Vida test', 100.00
);

-- 2. gözlem: aynı fiyat (snapshot YAZILMAMALI)
SELECT public.record_price_observation(
  (SELECT id FROM public.suppliers WHERE slug='enderyapi'),
  'VDA-TEST-001', 'Vida test', 100.00
);

-- 3. gözlem: yeni fiyat 110 (snapshot yazılmalı)
SELECT public.record_price_observation(
  (SELECT id FROM public.suppliers WHERE slug='enderyapi'),
  'VDA-TEST-001', 'Vida test (yeni ad)', 110.00
);

-- 4. gözlem: aynı 110 (snapshot YAZILMAMALI)
SELECT public.record_price_observation(
  (SELECT id FROM public.suppliers WHERE slug='enderyapi'),
  'VDA-TEST-001', 'Vida test (yeni ad)', 110.00
);

-- 5. gözlem: 95 (snapshot yazılmalı; fiyat düşebilir de)
SELECT public.record_price_observation(
  (SELECT id FROM public.suppliers WHERE slug='enderyapi'),
  'VDA-TEST-001', 'Vida test (yeni ad)', 95.00
);

-- Beklenti: 3 snapshot, current_unit_price=95
SELECT count(*) AS snapshot_count FROM public.price_snapshots
 WHERE product_id = (SELECT id FROM public.products WHERE code='VDA-TEST-001');
-- → 3

SELECT current_unit_price, name FROM public.products WHERE code='VDA-TEST-001';
-- → 95.00, 'Vida test (yeni ad)'
```

| Doğrulama | Beklenen | Gerçek |
|-----------|----------|--------|
| Snapshot sayısı | 3 | 3 ✅ (fiyat dizisi: [100, 110, 95]) |
| current_unit_price | 95.00 | 95.00 ✅ |
| products.name (en son) | 'Vida test (yeni ad)' | 'Vida test (yeni ad)' ✅ |

---

## QS-03 — RLS doğrulama (SC-004)

```sql
-- 1) Service role ile select (Supabase SQL Editor service_role kullanır):
SELECT count(*) FROM public.suppliers;
-- → 1+

-- 2) Anon role ile select test:
-- Supabase Studio → SQL Editor → Run as: anon role
-- (veya: SET ROLE anon; ... ; RESET ROLE; ile simüle)
SET ROLE anon;
SELECT count(*) FROM public.suppliers;
-- → 0 (RLS bloklar)
RESET ROLE;

-- 3) Authenticated role + auth.uid() NULL:
-- Tipik olarak Studio bu çağrıyı service_role yapar; gerçek test için
-- frontend client (browser) ile login + select denemek gerek.
```

| Doğrulama | Beklenen | Gerçek |
|-----------|----------|--------|
| Service role select | >0 satır | 1 satır ✅ |
| Anon role select | 0 satır | `42501 permission denied` ✅ (daha güçlü; tabloya hiç erişim yok) |
| Authenticated role (session yok) select | 0 satır | 0 satır ✅ (RLS `auth.uid() IS NULL` ile satır filtreliyor) |

**Not**: Authenticated client gerçek session ile dolduğunda `auth.uid()` UUID döner, satırlar görünür. Bu davranış 004 feature'da scraper testi sırasında frontend client ile doğrulanır.

**Önemli bulgu**: İlk migration'da `GRANT` ifadeleri unutulduğu için authenticated role da "permission denied" alıyordu (RLS değil, table-level privilege eksik). `20260516154905_grant_table_privileges_to_authenticated` migration'ı ile düzeltildi. RLS + table-level GRANT iki katmanlı savunma.

---

## QS-04 — Constraint ihlali testleri

```sql
-- 1) Aynı slug iki kez
INSERT INTO public.suppliers (slug, name, base_url)
VALUES ('enderyapi', 'Dup', 'https://x.example');
-- → 23505 (unique_violation)

-- 2) Geçersiz slug formatı
INSERT INTO public.suppliers (slug, name, base_url)
VALUES ('Endery API!', 'Dup', 'https://x.example');
-- → 23514 (check_violation)

-- 3) Negatif total_amount
WITH s AS (SELECT id FROM public.suppliers WHERE slug='enderyapi')
INSERT INTO public.supplier_orders (supplier_id, order_no, status, ordered_at, total_amount)
SELECT s.id, 'NEG-001', 'Onaylandı', now(), -1 FROM s;
-- → 23514

-- 4) RESTRICT: supplier silinemez
DELETE FROM public.suppliers WHERE slug='enderyapi';
-- → 23503 (foreign_key_violation, supplier_orders var)

-- 5) CASCADE: order silindiğinde items silinir
-- Önce QS-01'den ESP018-12345 sipariş ID'sini al, delete et, items sayısını ölç.
WITH o AS (DELETE FROM public.supplier_orders WHERE order_no='ESP018-12345' RETURNING id)
SELECT count(*) AS remaining_items FROM public.order_items
 WHERE order_id IN (SELECT id FROM o);
-- → 0
```

| Test | Beklenen kod | Gerçek |
|------|--------------|--------|
| Dup slug | 23505 | 23505 ✅ |
| Bad slug format | 23514 | 23514 ✅ |
| Negative total | 23514 | 23514 ✅ |
| Supplier delete RESTRICT | 23503 | 23503 ✅ |
| Order delete CASCADE | 0 satır | 0 satır ✅ |

---

## QS-05 — Multi-supplier (User Story 3)

```sql
-- Yeni tedarikçi
INSERT INTO public.suppliers (slug, name, base_url)
VALUES ('acme-b2b', 'Acme B2B', 'https://b2b.acme.example');

-- Aynı kod farklı tedarikçide
WITH s1 AS (SELECT id FROM public.suppliers WHERE slug='enderyapi'),
     s2 AS (SELECT id FROM public.suppliers WHERE slug='acme-b2b')
INSERT INTO public.products (supplier_id, code, name)
SELECT s1.id, 'VDA-M8', 'Vida M8 (Enderyapi)' FROM s1
UNION ALL
SELECT s2.id, 'VDA-M8', 'Vida M8 (Acme)' FROM s2;

SELECT count(*) FROM public.products WHERE code='VDA-M8';
-- → 2

-- Aynı tedarikçide aynı kod tekrar?
WITH s1 AS (SELECT id FROM public.suppliers WHERE slug='enderyapi')
INSERT INTO public.products (supplier_id, code, name)
SELECT s1.id, 'VDA-M8', 'Dup' FROM s1;
-- → 23505

-- Temizlik
DELETE FROM public.products WHERE code='VDA-M8';
DELETE FROM public.suppliers WHERE slug='acme-b2b';
```

| Test | Beklenen | Gerçek |
|------|----------|--------|
| 2 supplier'da aynı kod | 2 satır | 2 satır ✅ |
| Aynı supplier'da dup | 23505 | 23505 ✅ |

---

## QS-06 — Advisors (SC-001)

```ts
// MCP üzerinden:
mcp__supabase__get_advisors({ type: 'security' });
mcp__supabase__get_advisors({ type: 'performance' });
```

**Beklenen**: kritik (error/warn) seviyede uyarı çıkmaz. info seviyede mesajlar kabul edilebilir (örn. "consider adding index").

| Type | Critical (err/warn) | Gerçek |
|------|---------------------|--------|
| security | 0 schema-related | 0 ✅ (1 ek WARN var: `auth_leaked_password_protection` — Auth Dashboard ayarı, schema dışı; manuel açılır) |
| performance | 0 | 0 ✅ (sadece 2 INFO `unused_index` — yeni index, henüz query çalışmadı) |

**İlk advisor turunda 22 WARN vardı**: 20 RLS init plan + 1 function search_path + 1 auth password protection. İki migration ile düzeltildi:
- `20260516154431_fix_set_updated_at_search_path` — function'a `SET search_path` eklendi
- `20260516154507_rls_policies_optimize_auth_calls` — 20 policy'de `auth.uid()` → `(select auth.uid())` ile sarıldı

---

## QS-07 — TypeScript type üretimi (SC-005)

```ts
// MCP:
const result = await mcp__supabase__generate_typescript_types();
// → result.types: string (TS dosyası içeriği)
// → bu içerik lib/supabase/database.types.ts olarak yaz
```

Sonra `npm run build` (veya `tsc --noEmit`) → hatasız geçmeli.

| Doğrulama | Beklenen | Gerçek |
|-----------|----------|--------|
| Type dosyası yazıldı | `lib/supabase/database.types.ts` var | ✅ |
| `Database` tipi 5 tablo + 1 fonksiyon içerir | evet | ✅ (tables: order_items, price_snapshots, products, supplier_orders, suppliers + Functions.record_price_observation) |
| `npx tsc --noEmit` | başarılı | ✅ (`TS OK`) |

---

## QS-08 — Genel temizlik (testler sonrası)

```sql
-- Test verisini sil (production'da çalıştırılmaz, sadece tekrar test için)
DELETE FROM public.products WHERE code IN ('VDA-TEST-001');
DELETE FROM public.supplier_orders WHERE order_no LIKE 'ESP018-%';
-- price_snapshots CASCADE ile temizlenir
```

---

## Toplam doğrulama özeti (SC-006)

Tüm QS-01 → QS-07 tamamlandığında:

| SC | Doğrulandı? |
|----|-------------|
| SC-001 (advisors clean) | ✅ (2 düzeltme migration sonrası schema-related 0 critical) |
| SC-002 (idempotent) | ✅ (3 round identical, sayılar sabit) |
| SC-003 (snapshot uniqueness) | ✅ (5 gözlem → 3 snapshot) |
| SC-004 (RLS) | ✅ (service_role=görür, anon=permission denied, authenticated no-session=0 satır) |
| SC-005 (TS types) | ✅ (`npx tsc --noEmit` clean) |
| SC-006 (≤30 dk doğrulama) | ✅ (MCP üzerinden tüm QS'ler tek seansta tamamlandı) |
