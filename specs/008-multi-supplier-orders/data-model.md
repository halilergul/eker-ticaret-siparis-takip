# Data Model: 008 İkizler + Levent Şimşek tedarikçileri

**Date**: 2026-05-17 | **Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

## Yeni tablo, RPC, RLS politikası YOK

Bu feature **mevcut şemayı kullanır** (Feature 003'te kurulan 5 tablo + Feature 007'de eklenen `scrape_schedule`). Tek iş: 2 tedarikçi seed.

## Entity Inventory (mevcut, sadece seed)

| Tablo | Bu feature'da dokunulan | Operasyon |
|-------|------------------------|-----------|
| `suppliers` | ✅ | `INSERT` 2 satır (ikizler + leventsimsek) |
| `scrape_schedule` | ✅ | `INSERT` 2 satır (her supplier için default disabled) |
| `supplier_orders` | ✅ (runtime, scrape ile) | Adapter çalıştığında `INSERT` (mevcut yapı) |
| `order_items` | ✅ (runtime, scrape ile) | Adapter çalıştığında `INSERT` (mevcut yapı; `product_id` initially `NULL`) |
| `products` | ❌ | Bu feature'da catalog scrape yok → ürün satırı yaratılmaz (009 işi) |
| `price_snapshots` | ❌ | Catalog yok → snapshot yok (009 işi) |
| `scrape_runs` | ✅ (runtime) | Her trigger için satır oluşur (mevcut yapı) |

## Seed Migration 1: `suppliers` tablosuna 2 yeni tedarikçi

**Dosya adı**: `supabase/migrations/2026MMDDhhmmss_seed_ikizler_leventsimsek.sql` (timestamp uygulama anında belirlenir; `mcp__supabase__apply_migration` üretir).

```sql
-- Migration: seed ikizler + leventsimsek suppliers (feature 008)
-- Idempotent via ON CONFLICT (slug unique)
-- Applied via mcp__supabase__apply_migration({ name: "seed_ikizler_leventsimsek" })
-- Date: 2026-05-17

INSERT INTO public.suppliers (slug, name, base_url)
VALUES
  ('ikizler', 'İkizler Hırdavat', 'http://bayi.ikizlerhirdavat.com'),
  ('leventsimsek', 'Levent Şimşek Armatür', 'https://liste.leventsimsekarmatur.com')
ON CONFLICT (slug) DO NOTHING;
```

**Notlar**:
- `slug` UNIQUE constraint mevcut (003 core tables) → ON CONFLICT güvenli, idempotent.
- `name` Türkçe karakterli (İ, ş, ı) — Postgres UTF-8 default, sorun yok.
- `base_url` adapter içinde import edilen `<slug>.constants.ts` ile **çiftleşir** (DB → display amaçlı; adapter → runtime). Tutarsızlık olmaması için ikisi de aynı URL.
- `id` (uuid), `created_at`, `updated_at` — default'lar.

## Seed Migration 2: `scrape_schedule` tablosuna 2 yeni satır

**Dosya adı**: `supabase/migrations/2026MMDDhhmmss_seed_schedule_ikizler_leventsimsek.sql`.

```sql
-- Migration: seed scrape_schedule for ikizler + leventsimsek (feature 008)
-- Default: disabled, daily_hour_utc=9 (kullanıcı settings'ten aktive eder)
-- Idempotent via ON CONFLICT (supplier_id unique)
-- Applied via mcp__supabase__apply_migration({ name: "seed_schedule_ikizler_leventsimsek" })
-- Date: 2026-05-17

INSERT INTO public.scrape_schedule (supplier_id, enabled, daily_hour_utc)
SELECT id, false, 9
FROM public.suppliers
WHERE slug IN ('ikizler', 'leventsimsek')
ON CONFLICT (supplier_id) DO NOTHING;
```

**Notlar**:
- `scrape_schedule.supplier_id UNIQUE` constraint (007 migration) → idempotent.
- `enabled=false` default — kullanıcı settings UI'dan aç/kapa yapacak.
- `daily_hour_utc=9` — Enderyapı ile aynı default (UTC 09:00 = TR 12:00). Kullanıcı kart-bazında değiştirebilir.

## Validation Rules (mevcut, hatırlatma)

| Tablo | Constraint | Etki |
|-------|-----------|------|
| `suppliers.slug` | UNIQUE | Aynı slug iki kez seed olmaz |
| `scrape_schedule.supplier_id` | UNIQUE | Her tedarikçi için tek schedule |
| `scrape_schedule.daily_hour_utc` | CHECK (0–23) | Geçerli saat |
| `supplier_orders` | UNIQUE (supplier_id, order_no) | Aynı sipariş çift kaydedilmez (idempotency core) |
| `order_items` | UNIQUE (order_id, line_no) veya benzeri | Aynı satır çift eklenmez |
| `products.code` | UNIQUE per (supplier_id, code) | Farklı tedarikçilerde aynı code çakışmaz |
| `scrape_runs.trigger_type` | CHECK IN ('auto','manual','unknown') | trigger_type doğrulama |

## State Transitions (runtime, yeni adapter'lar için)

Yeni `scrape_runs` satırının yaşam döngüsü mevcut Feature 004 + 007 ile **aynıdır**:

```
[start] → running
  ├─ tüm OK + items var → success
  ├─ kısmi hatalar var + items var → partial
  ├─ kritik fail (login, network) → failed
  └─ global timeout aşıldı → aborted
```

`updateScheduleCache(supplier_id, status)` sadece `trigger_type='auto'` için çağrılır (007'de eklenmiş davranış).

## Index Strategy

Yeni index gerekmez. Mevcut index'ler:

- `suppliers (slug)` UNIQUE — seed lookup için yeterli.
- `supplier_orders (supplier_id, order_no)` — adapter'ın "bu sipariş daha önce gelmiş mi" idempotency check'i için kullanılır (mevcut, 003).
- `scrape_runs (supplier_id, started_at desc)` — settings sayfası "Son koşumlar" listesi için (007'de eklenmiş).

## Data Volume Beklentisi

| Tablo | İkizler | Levent Şimşek | Not |
|-------|---------|----------------|-----|
| `supplier_orders` ilk scrape | 20–80 satır | 20–80 satır | Kullanıcının geçmiş alımına bağlı |
| `order_items` ilk scrape | 100–400 satır | 100–400 satır | Sipariş başına ortalama 5 satır |
| `scrape_runs` günlük | 1 satır × tedarikçi | 1 satır × tedarikçi | Cron + opsiyonel manuel |
| `products` | 0 | 0 | Catalog yok — 009'da dolacak |

3 tedarikçi × 1 yıl scrape sonunda toplam tablo boyutu ~50K satır altı bekleniyor → Supabase free tier (500MB) için sorun değil.

## Backfill ve Migration Sıralaması

1. Seed migration 1 (`suppliers`) önce uygulanır.
2. Seed migration 2 (`scrape_schedule`) sonra — `WHERE slug IN (...)` clause'u 1. migration'a bağımlı.
3. Adapter kodu deploy edilir (`adapter-registry.ts` güncellemesi).
4. Workflow YAML güncellenir (`supplier choice options`).
5. GitHub Secrets eklenir (4 secret).
6. Manuel smoke test (settings → "Şimdi tetikle").

Sıralama bozulursa: workflow yeni slug görmeden tetiklenirse `getAdapter()` → `ScrapeError({ mode: "supplier-not-found" })` → run "Başarısız", DB tutarlı kalır.

## Schema Compatibility

Mevcut RLS politikaları (`authenticated_select`, `authenticated_insert/update` vb.) yeni satırları **otomatik** kapsar — `supplier_id` üzerinden filtre yapmayan policy'ler tüm tedarikçileri aynı şekilde değerlendirir. Yeni policy yazılmaz.

`Database` TypeScript type'ları (`lib/supabase/database.types.ts`) seed migration sonrası **yeniden üretilmez** — sadece veri değişikliği, şema değişmiyor. `mcp__supabase__generate_typescript_types` çağrısı opsiyonel (hiçbir field değişmedi).
