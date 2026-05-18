# Quickstart: 009 İkizler + Levent Şimşek catalog scrape

**Date**: 2026-05-17 | **Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

İmplementasyon sonrası iki tedarikçi catalog scrape'ini production'da test etme akışı. 008 quickstart'ı catalog phase için genişletir.

## Ön gereksinimler

- **008 production'da aktif**: İkizler + Levent Şimşek sipariş scrape'leri çalışıyor; settings sayfasında 3 kart görünüyor; her birinin "Şimdi tetikle" butonu fonksiyonel.
- **`products` tablosunda satırlar var**: 008'in son koşumlarından sonra `products` tablosunda İkizler için ~20-30, Levent Şimşek için ~3-7 satır olmalı (sipariş'ten upsert). Catalog phase bu satırları input olarak kullanır.

```sql
-- Doğrulama
SELECT s.slug, COUNT(p.id) AS product_count
FROM suppliers s
LEFT JOIN products p ON p.supplier_id = s.id
WHERE s.slug IN ('ikizler', 'leventsimsek')
GROUP BY s.slug;
-- Beklenen: ikizler ≥10, leventsimsek ≥3
```

- **Geliştirici credentials** `.env.local`'da (008'den kalan): `IKIZLER_USERNAME/PASSWORD`, `LEVENTSIMSEK_USERNAME/PASSWORD`.

## 1. Adapter geliştirme — DOM keşfi (per supplier 1-4 saat)

### 1a. İkizler catalog DOM keşfi

[contracts/ikizler-catalog-discovery.md](contracts/ikizler-catalog-discovery.md) Faz 0-3 takip edilir:

1. **Manuel browser** ile catalog URL pattern tespit (10-15 dk).
2. **Diag script** ile screenshot + HTML dump (15-30 dk).
3. **Selector tespit** ve `ikizler.constants.ts`'a `CATALOG_FIELD_SELECTORS` + `CATALOG_PATHS` ekle (30-45 dk).
4. **`scrapeCatalog` implement** (45-60 dk).

### 1b. Levent Şimşek catalog DOM keşfi

[contracts/leventsimsek-catalog-discovery.md](contracts/leventsimsek-catalog-discovery.md) Faz 0-3:

1. **Scenario tespiti** (A: catalog var / B: yok / C: search-only) — 15-30 dk.
2. **Scenario'ya göre** implementasyon (Scenario A için 60 dk; B için 15 dk minimal stub; C için 45 dk).

**Paralel çalışılabilir** — 2 adapter farklı dosyalar.

## 2. Local catalog smoke test (per supplier 15-30 dk)

### 2a. İkizler local smoke

```bash
npm run scrape:all -- --supplier ikizler --headed --verbose
# --skip-catalog YOK — catalog phase çalışır
```

**Beklenen çıktı** (örnek):
```
[scrape:all] Tedarikçi: İkizler Hırdavat (tetik: unknown)
[scrape:all] Login deneniyor...
[scrape:all] ✓ Login başarılı
[scrape:all] Sipariş aşaması: 0 yeni, 13 mevcut
[scrape:all] Catalog aşaması başlıyor (28 ürün)
[scrape:all]   5/28 işlendi
[scrape:all]   10/28 işlendi
...
[scrape:all] Catalog aşaması: 28 yeni snapshot, 0 hata
[scrape:all] ✅ Başarılı (Xm Ys)
```

**Hata olursa**:
- `catalog-parse-failed` → `scrape-debug/<runId>/*.html` dump'ları incele, selector güncelle.
- `product-not-found` → search endpoint çalışmıyor olabilir; constants güncelle.
- `vat-rate-missing` → Adapter `parseVatRate` parse fonksiyonunu kontrol et; default %20 kararı uygulanıyor mu (R-005).

### 2b. İkizler idempotency

```bash
npm run scrape:all -- --supplier ikizler --verbose
```

**Beklenen**: `Catalog aşaması: 0 yeni snapshot, 0 hata` (aynı gün/aynı fiyat → DB no-op).

### 2c. Catalog URL cache doğrulama

İlk koşumdan sonra DB'yi kontrol et:

```sql
SELECT code, catalog_url, last_seen_at
FROM products
WHERE supplier_id = (SELECT id FROM suppliers WHERE slug = 'ikizler')
  AND catalog_url IS NOT NULL
LIMIT 5;
-- Beklenen: 5 satır, hepsi catalog_url dolu
```

İkinci koşumda her ürün **cache hit** ile direkt navigate eder → koşum süresi ilk koşumun yaklaşık yarısı olur.

### 2d. Levent Şimşek local smoke

```bash
npm run scrape:all -- --supplier leventsimsek --headed --verbose
```

**Scenario A doğrulandıysa**:
```
[scrape:all] Catalog aşaması: N yeni snapshot, 0 hata
```

**Scenario B doğrulandıysa**:
```
[scrape:all] Catalog aşaması: 0 ürün (catalog endpoint bulunamadı; sipariş modal verisi snapshot olarak kayıtlı)
```

İki durumda da koşum `Başarılı` statusüyle bitmeli.

## 3. Hata izolasyonu testi (10 dk)

**Amaç**: SC-005 doğrulama — catalog fail orders'ı engellememeli.

1. `ikizler.constants.ts`'da `CATALOG_FIELD_SELECTORS.NET_EXCL_VAT` array'ini boşaltıp veya geçersiz selector'a değiştir.
2. Çalıştır: `npm run scrape:all -- --supplier ikizler --verbose`
3. Beklenen:
   - **Orders phase**: Başarılı (`0 yeni, 13 mevcut` veya benzer).
   - **Catalog phase**: Başarısız (`28 hata: catalog-parse-failed`).
   - **Run status**: `partial_failure` veya `error` (status logic'e bağlı).
   - **`scrape_runs.summary`**: `orders_*` alanları normal, `snapshots_added: 0`, `errors[]` dolu.
4. Geri al: constants'ı düzelt, idempotency test'ini tekrarla.

## 4. Production smoke (per supplier 10-15 dk)

### 4a. İkizler production

1. `https://eker-ticaret-siparis-takip.vercel.app/dashboard/settings` aç.
2. İkizler kartında **"Şimdi tetikle"** butonuna bas.
3. Toast: "Tetiklendi (manuel)" — UI hemen yenilenir; "Son koşumlar"da `Manuel · Çalışıyor` satırı.
4. 5–10 dk bekle (sayfayı yenile).
5. **Beklenen**: satır `Manuel · Başarılı · N sipariş · M satır · K snapshot` — yeni summary alanı dolmuş.
6. `/dashboard/price-changes?supplier=ikizler` aç — şu an boş (henüz 1 snapshot var, fark için 2 gerek). Bilgilendirme normal: "Henüz karşılaştırma için yeterli geçmiş yok".

### 4b. Levent Şimşek production

Aynı akış, "Levent Şimşek Armatür" kartı.

## 5. İkinci koşum + fiyat değişimi doğrulama (24-72 saat sonra, 5 dk)

Catalog scrape'in **gerçek değer ürettiği an** ikinci snapshot alındığında.

1. 24 saat veya daha fazla bekle (cron tetiklemesi veya manuel "Şimdi tetikle"). Manuel test için fiyat değişimi simülasyonu (DB'de bir snapshot'ın `unit_price`'ı geçici olarak düşürülebilir).
2. `/dashboard/price-changes` aç.
3. **Beklenen**: 3 tedarikçi (Enderyapi + İkizler + Levent Şimşek) listede ürünleri görünür (en az 1 fiyat değişikliği varsa).
4. Tedarikçi filtresi her birini sırayla seç → liste filtreleniyor mu doğrula.

## 6. Manuel ürün fiyat karşılaştırması (5-10 dk)

**SC-003 doğrulama**:

1. İkizler B2B sitesine manuel login.
2. 3 örnek ürün için catalog detay sayfasını aç, KDV dahil özel birim fiyatını not.
3. DB'den kontrol:
```sql
SELECT p.code, p.name, ps.unit_price, ps.captured_at
FROM products p
JOIN price_snapshots ps ON ps.product_id = p.id
WHERE p.supplier_id = (SELECT id FROM suppliers WHERE slug = 'ikizler')
  AND p.code IN ('AR-1234', 'AR-5678', 'AR-9012')  -- örnek kodlar
ORDER BY ps.captured_at DESC
LIMIT 9;
```
4. **Beklenen**: Her ürün için en son snapshot'ın `unit_price` değeri B2B sitedeki KDV dahil özel fiyatla **±0.01 ₺ tolerans** içinde eşleşmeli.

Levent Şimşek için aynı akış (Scenario A doğrulandıysa).

## 7. Cron doğrulama (24+ saat, 5 dk)

1. Settings'te İkizler ve Levent Şimşek için `enabled=true` + saat seç.
2. 24 saat içinde GitHub Actions'da otomatik koşumlar:
   - `supplier=ikizler, trigger_type=auto, status=success, summary.snapshots_added > 0` (ikinci/üçüncü gün'den itibaren değişen ürünler için)
   - `supplier=leventsimsek, trigger_type=auto, ...`
3. `/dashboard/settings` "Son koşumlar"da otomatik satırlar görünür.

## 8. Credentials sızıntı kontrolü (1 dk)

008'de zaten yapıldı; bu feature yeni credential eklemediği için yeni tarama gerekmez. Yine de:

```bash
git grep -E "IKIZLER_(USERNAME|PASSWORD)=|LEVENTSIMSEK_(USERNAME|PASSWORD)=" -- . ':!.env.example' ':!**/specs/**'
```

**Beklenen**: 0 finding (kod referansı `process.env.IKIZLER_USERNAME` kabul; düz değer yasak).

## 9. Rollback Planı

Eğer yeni catalog implementasyonu problemli ise:

```sql
-- Sadece bu feature'ın eklediği catalog snapshot'larını sil
DELETE FROM price_snapshots
WHERE captured_at >= '2026-05-17 00:00:00+00'  -- bu feature deploy tarihi
  AND source = 'catalog'
  AND product_id IN (
    SELECT id FROM products
    WHERE supplier_id IN (
      SELECT id FROM suppliers WHERE slug IN ('ikizler', 'leventsimsek')
    )
  );
```

Kod tarafında `adapter.scrapeCatalog`'u geçici olarak `undefined` yapmak (yorum satırı) → orchestrator catalog phase'i atlar → orders normal çalışır.

## Toplam Süre Tahmini

| Faz | Süre |
|-----|------|
| 1. DOM keşfi (per supplier) | 1-4 saat × 2 |
| 2. Local smoke + idempotency | 30 dk × 2 |
| 3. Hata izolasyonu testi | 10 dk |
| 4. Production smoke | 15 dk × 2 |
| 5. İkinci koşum + price-changes doğrulama | 24-72 saat (bekleme) + 5 dk aktif |
| 6. Manuel ürün karşılaştırması | 10 dk |
| 7. Cron doğrulama | 24 saat (bekleme) + 5 dk |
| 8. Sızıntı kontrolü | 1 dk |
| **Net çalışma** | ~3-9 saat (DOM keşfine bağlı) |

---

## Başarı kriterlerinin quickstart eşlemesi

| Spec SC | Quickstart adımı |
|---------|------------------|
| SC-001 (10 dk catalog scrape) | Adım 2 — `--verbose` çıktısında bitiş süresi |
| SC-002 (3 tedarikçi filtre) | Adım 5 — `/dashboard/price-changes` |
| SC-003 (±0.01 ₺ fiyat eşleşmesi) | Adım 6 — manuel SQL + B2B karşılaştırması |
| SC-004 (idempotent) | Adım 2b ve 2d — ikinci koşum |
| SC-005 (catalog fail ≠ orders fail) | Adım 3 — hata izolasyonu testi |
| SC-006 (per-supplier izolasyon) | Adım 7 — cron eş zamanlı tetiklemede biri fail diğeri başarılı |
| SC-007 (0 TL maliyet) | Genel — workflow runner süresi izlenir |
