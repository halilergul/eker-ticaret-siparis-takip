# Phase 1 Data Model: Yedekler İnşaat tedarikçi eklemesi

**Plan**: [plan.md](./plan.md)  
**Spec**: [spec.md](./spec.md)  
**Tarih**: 2026-06-04

## Özet

Bu feature **yeni tablo veya kolon eklemiyor**. Mevcut 003 (multi-supplier schema) + 006 (catalog/price snapshots) + 008 (multi-supplier orders) + 009 (catalog generalization) schema'ları olduğu gibi kullanılır. Tek değişiklik: `suppliers` ve `scrape_schedule` tablolarına Yedekler için 1 satır seed eklenir.

## Mevcut Entity'lerin Yedekler Kullanımı

### Supplier

**Tablo**: `suppliers`  
**Yeni satır**:
```sql
INSERT INTO suppliers (slug, name, base_url) VALUES
  ('yedekler', 'Yedekler İnşaat', 'https://bayi.yedekler.com.tr');
```
(`base_url` keşif sonrası kesinleşir — HTTPS varsayılır, HTTP ise güncellenir)

**Alan kullanımları**:
| Alan | Değer | Not |
|---|---|---|
| `id` | uuid (DB autogen) | Adapter'ın bilmesine gerek yok |
| `slug` | `yedekler` | Adapter'ın slug'ı bununla eşleşmeli; workflow choice değeri |
| `name` | `Yedekler İnşaat` | UI'da gösterilen ad; Türkçe karakter desteği |
| `base_url` | site URL | Keşif sonrası kesinleşir |
| `created_at` | auto | — |
| `updated_at` | auto | — |

**RLS**: Mevcut policy'ler (003'te kuruldu) aynen geçerli — tek-kullanıcı sistemi.

### Scrape Schedule

**Tablo**: `scrape_schedule`  
**Yeni satır**: Yedekler için cron etkinleştirme satırı.

```sql
INSERT INTO scrape_schedule (supplier_id, enabled, daily_hour_utc) VALUES
  ((SELECT id FROM suppliers WHERE slug='yedekler'), true, 3);
```
(`daily_hour_utc` İstanbul saatiyle 06:00 = UTC 03:00 — diğer tedarikçilerle aynı saat veya yarım saat farkı; 008/009'da kullanılan saat'lere bakılır)

**Alan kullanımları**:
| Alan | Değer | Not |
|---|---|---|
| `supplier_id` | yedekler id | FK |
| `enabled` | true | Settings UI'dan toggle edilebilir |
| `daily_hour_utc` | 3 (~06:00 TR) | Settings UI'dan değiştirilebilir |
| `last_auto_run_at` | NULL (auto güncellenir) | İlk koşum sonrası dolar |
| `last_auto_run_status` | NULL | İlk koşum sonrası dolar |

### Scrape Run

**Tablo**: `scrape_runs`  
**Yeni satır**: Yok (her scrape koşumunda otomatik insert) — sadece kullanım örüntüsü:
- Manuel tetikleme: `pre-insert` (`status=running`, `trigger_type=manual`, `summary={ pending_dispatch: true }`) → workflow dispatch → script pickup
- Otomatik tetikleme: `startRun()` yeni satır insert eder (`trigger_type=auto`)

Schema değişikliği yok. Sadece supplier_id ile Yedekler kayıtları diğer 3'ten ayrışır.

### Order, Order Item, Product, Product Price Snapshot

Tüm bu tablolar supplier_id ile multi-supplier desteğine zaten sahip (003 + 006 schema). Yedekler verisi diğerleriyle aynı tablolara yazılır, supplier_id farkı yeterli ayrım.

**Idempotency keyleri** (mevcut, hatırlatma):
- `orders`: `(supplier_id, order_no)` unique
- `order_items`: `(order_id, product_id)` unique (aynı sipariş içinde aynı ürün tek satır)
- `products`: `(supplier_id, code)` unique
- `product_price_snapshots`: `(product_id, captured_at::date, unit_price)` unique (009 writePriceSnapshot idempotency)

Yedekler bu kurallara doğal uyum sağlayacak; adapter implementation idempotency için ek bir şey yapmaz, writer (supabase-writer) zaten ON CONFLICT yönetiyor.

## State Transitions

### Scrape Run State Machine (mevcut)

```
running → success         (succeedRun)
running → partial         (partialRun — catalog fail ama orders OK)
running → failed          (failRun)
running → aborted         (abortRun — timeout/manuel iptal)
```

Yedekler için ek state yok.

### Schedule State (mevcut)

```
enabled=false (default)  ←→  enabled=true (kullanıcı ayarlar)
```

Yedekler seed'i `enabled=true` ile başlar (diğer 3 tedarikçinin pattern'i).

## Migration File

`supabase/migrations/20260605000000_seed_yedekler.sql` oluşturulur:

```sql
-- Feature 010: Yedekler İnşaat tedarikçi eklemesi
-- Supplier row + scrape_schedule row

INSERT INTO suppliers (slug, name, base_url) VALUES
  ('yedekler', 'Yedekler İnşaat', 'https://bayi.yedekler.com.tr')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO scrape_schedule (supplier_id, enabled, daily_hour_utc)
SELECT id, true, 3 FROM suppliers WHERE slug = 'yedekler'
ON CONFLICT (supplier_id) DO NOTHING;
```

**Idempotent**: Aynı migration tekrar koşulsa hata vermez (ON CONFLICT DO NOTHING).

## Tahmini Veri Hacmi (ilk 30 gün, 4 tedarikçili sistem)

| Tablo | Yedekler katkısı | Toplam (4 tedarikçi) |
|---|---|---|
| `suppliers` | +1 satır | 4 satır |
| `scrape_schedule` | +1 satır | 4 satır |
| `scrape_runs` | ~120 satır/ay (günde ~4 koşum) | ~480 satır/ay |
| `orders` | ~30 satır/ay (varsayım: aylık 10-50 sipariş, 30 ortalama) | ~600 satır/ay |
| `order_items` | ~150 satır/ay (sipariş başı ortalama 5 kalem) | ~3000 satır/ay |
| `products` | +50-500 (catalog'da ne varsa, bir defalık) | ~1000-2000 satır toplam |
| `product_price_snapshots` | ~50-500 satır/gün (catalog scrape başına) | ~30k-300k satır/ay |

Toplam: Supabase free tier 500MB DB sınırına çok uzak (Postgres 1 satır ortalama ~200 byte; 300k satır ~60MB).

## Sonraki Adım

`data-model.md` complete. `contracts/adapter-interface.md` ve `quickstart.md`'ye geçilir.
