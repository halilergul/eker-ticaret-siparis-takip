# Data Model: 009 İkizler + Levent Şimşek catalog scrape

**Date**: 2026-05-17 | **Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

**YENI TABLO YOK · YENI MIGRATION YOK · YENİ RPC YOK · YENİ RLS YOK.**

Bu feature mevcut şemayı tüketir; 006'da kurulan `products` + `price_snapshots` + `scrape_runs` yapısı yeterlidir. Aşağıda **kullanılacak alanlar** ve **veri akışı** dokümante edilir; gerçek migration örneği yoktur.

---

## Kullanılan tablolar

### `public.suppliers` (mevcut, 008'de İkizler + Levent satırları seed edildi)

| Kolon | Tip | Notlar |
|-------|-----|--------|
| `id` | uuid PK | — |
| `slug` | text UNIQUE | `enderyapi`, `ikizler`, `leventsimsek` |
| `name` | text | "İkizler Hırdavat", "Levent Şimşek Armatür" |
| `base_url` | text | — |

**Bu feature dokunmaz.**

### `public.products` (mevcut, 006'da `vat_rate` + `catalog_url` eklendi)

| Kolon | Tip | Bu feature'da rolü |
|-------|-----|--------------------|
| `id` | uuid PK | — |
| `supplier_id` | uuid FK → `suppliers.id` | İkizler/Levent ürünleri için ilgili tedarikçi |
| `code` | text | Ürün kodu — adapter `scrapeCatalog` `productCode` parametresi olarak alır |
| `name` | text | İlk catalog scrape'te `CatalogScrapeResult.productName` ile güncellenebilir (idempotent UPSERT — 006'dan) |
| `brand` | text nullable | `CatalogScrapeResult.brand` ile güncellenebilir |
| `vat_rate` | numeric(4,4) nullable | İlk başarılı catalog scrape'te `CatalogScrapeResult.vatRate` ile yazılır |
| `catalog_url` | text nullable | Search ile bulunan URL veya `RawOrderItem.catalogUrl` cache — sonraki koşumlarda navigate hızlandırır |
| `last_seen_at` | timestamptz | Her başarılı catalog scrape sonrası güncellenir |

**Operasyon**: `INSERT ... ON CONFLICT (supplier_id, code) DO UPDATE` — supabase-writer 006'dan idempotent.

### `public.price_snapshots` (mevcut, 006 migration'ı genişletti)

| Kolon | Tip | Bu feature'da rolü |
|-------|-----|--------------------|
| `id` | uuid PK | — |
| `product_id` | uuid FK → `products.id` | — |
| `captured_at` | timestamptz | Her scrape için NOW() |
| `unit_price` | numeric (legacy) veya `unit_price_with_vat` | KDV dahil özel birim fiyat (canonical) |
| `unit_price_excl_vat` | numeric | KDV hariç net fiyat — adapter'dan ham gelir |
| `vat_rate` | numeric(4,4) | %20 ise 0.2000 |
| `list_price` | numeric nullable | Referans |
| `discount_text` | text nullable | Referans |
| `source` | text | `'catalog'` (bu feature) veya `'order'` (sipariş anı) |
| `currency` | text CHECK ('TRY') | TRY sabit |

**Operasyon**: 003'te tanımlı `record_price_observation(product_id, unit_price, captured_at)` RPC — idempotent (aynı gün + aynı fiyat → DO NOTHING).

**Uyarı**: 006'da `record_price_observation` sadece `unit_price` parametresi alıyor olabilir; ek alanlar (`list_price`, `discount_text`, vb.) `writePriceSnapshot` writer fonksiyonu üzerinden direkt insert ile yazılıyor. Bu feature **bu pattern'i değiştirmez** — writer mevcut sözleşmeyi takip eder.

### `public.scrape_runs` (mevcut, 004'ten)

| Kolon | Tip | Bu feature'da rolü |
|-------|-----|--------------------|
| `id` | uuid PK | — |
| `supplier_id` | uuid FK | — |
| `trigger_type` | text | `'manual' | 'auto'` |
| `status` | text | `'success' | 'partial_failure' | 'error'` |
| `started_at` | timestamptz | — |
| `finished_at` | timestamptz nullable | — |
| `summary` | jsonb | `{ orders_*, products_observed, snapshots_added, ... }` — `snapshots_added` bu feature için ölçüm noktası |
| `error_message` | text nullable | Failure mode taxonomy etiketi |

**Bu feature dokunmaz** (yapı yeterli). Sadece `summary.snapshots_added` ve `summary.products_observed` alanlarının doğru doldurulduğu doğrulanır (orchestrator zaten yapıyor: `scripts/scrape/all.ts:279`).

### `public.scrape_schedule` (mevcut, 008'de İkizler + Levent satırları seed edildi)

**Bu feature dokunmaz.** Tetikleme zaten 007/008 ile kurulu.

---

## Veri akışı (catalog phase)

```
 ┌──────────────────────────────────────────────────────────┐
 │ scripts/scrape/all.ts::catalogPhase(ctx, supplierId)     │
 │                                                          │
 │ 1. SELECT code, last_seen_at, catalog_url                │
 │    FROM products WHERE supplier_id = $supplierId         │
 │    [bilinen ürün listesi]                                │
 │                                                          │
 │ 2. targets = [{ productCode, catalogUrl }]               │
 │                                                          │
 │ 3. adapter.scrapeCatalog(ctx, targets)                   │
 │    → CatalogScrapeResult[]                               │
 │       { ok: true, productCode, catalogUrl, unitPriceExclVat,    │
 │         vatRate, unitPriceWithVat, listPrice, discountText, brand } │
 │       veya                                                │
 │       { ok: false, productCode, mode, message }          │
 │                                                          │
 │ 4. Başarılı her sonuç için:                              │
 │    a. UPSERT products (catalog_url, vat_rate, last_seen_at) │
 │    b. writePriceSnapshot({                                │
 │         productId, capturedAt: NOW,                       │
 │         unitPriceWithVat, unitPriceExclVat, vatRate,      │
 │         listPrice, discountText, source: 'catalog'        │
 │       })                                                  │
 │    c. summary.snapshots_added++                           │
 │                                                          │
 │ 5. Başarısız her sonuç için:                              │
 │    ctx.pushError(`catalog-${code}`, mode, message)        │
 │    [summary.errors[]'a eklenir, run status etkilenir]    │
 └──────────────────────────────────────────────────────────┘
```

**Anahtar nokta**: Tüm adımlar `scripts/scrape/all.ts:catalogPhase` içinde **zaten kurulu** (006). Bu feature yalnızca `adapter.scrapeCatalog(...)` çağrısının dolu (non-null) gelmesi için her adapter'ı tamamlar.

---

## Idempotency

- **Snapshot duplikasyonu**: 006'daki `record_price_observation` RPC veya equivalent writer fonksiyonu aynı gün/aynı `(product_id, unit_price, captured_at::date)` için no-op davranır. Doğrulama: aynı catalog scrape ardarda 2 kez → ikinci koşumda `summary.snapshots_added=0`.
- **Catalog URL cache**: İlk koşum search ile bulur + DB'ye yazar. İkinci koşum cache'ten direkt navigate. Adapter `catalog_url` doğruluğunu doğrulamalı (404 ise cache miss + search fallback).
- **Products UPSERT**: 003 + 006'da `(supplier_id, code)` UNIQUE; UPDATE only changed fields.

---

## RLS

Tüm tablolar 003'te `authenticated_*` policy'leri ile korunuyor. Catalog scrape **service_role key** kullanır (GitHub Actions runner üzerinde) → RLS bypass; yazma yetkili. **Bu feature yeni policy gerektirmez.**

---

## Veri hacmi tahmini

| Tedarikçi | Ürün sayısı (sipariş'ten) | Snapshot/gün | 1 ay sonra | 6 ay sonra |
|-----------|--------------------------|--------------|------------|------------|
| Enderyapi | ~5-30 (varsayım) | 1 | ~150 satır | ~900 satır |
| İkizler | ~30-80 (008 verisinden 61 item; ürün ~20-30) | 1 | ~700 satır | ~4200 satır |
| Levent Şimşek | ~5-15 (008'de 7 item; ürün ~3-7) | 1 | ~150 satır | ~900 satır |
| **Toplam** | ~40-125 | — | ~1000 satır | ~6000 satır |

Supabase free tier `price_snapshots`'a 100K+ satıra kadar rahat sığar — 1+ yıl sorun değil.

---

## Migration listesi

**YOK.** Bu feature 0 migration uygular. Tüm şema 003 + 006 + 008'den miras.

Eğer ileride şema değişiklikleri gerekirse (örn. `snapshots_observed_at` index'i performans için), ayrı bir migration olarak eklenir — ama V1 scope dışı.
