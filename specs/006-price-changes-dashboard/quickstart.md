# Quickstart — Manuel Doğrulama

**Feature**: 006-price-changes-dashboard | **Tarih**: 2026-05-17

Bu doküman implementasyon sonrası tarayıcıdan + terminalden çalıştırılacak manuel test senaryolarını içerir. SC-001 → SC-009 bu senaryolarla doğrulanır.

**Ön koşul**:
- 001 auth çalışıyor (`/login`)
- 003 schema uygulandı
- 004 + 005 tamam (DB'de en az birkaç sipariş var)
- 006 migration'lar uygulandı (`add_vat_rate_to_products`, `extend_price_snapshots`, `get_price_changes` RPC)
- `npm run dev` çalışıyor (`http://localhost:3000`)
- `.env.local`'de `SUPABASE_SERVICE_ROLE_KEY` + `ENDERYAPI_USERNAME` + `ENDERYAPI_PASSWORD` mevcut

---

## QS-00 — Hazırlık

```bash
npm run dev
```

```
http://localhost:3000 → login redirect
http://localhost:3000/dashboard/price-changes → login redirect (anonim)
```

| Doğrulama | Beklenen | Gerçek |
|-----------|----------|--------|
| Anonim `/dashboard/price-changes` | `/login`'e redirect | _doldur_ |
| Build clean | `npx tsc --noEmit` OK | _doldur_ |
| Migration'lar uygulandı | `mcp__supabase__list_migrations` 3 yeni | _doldur_ |
| `products.vat_rate` kolonu var | `SELECT vat_rate FROM products LIMIT 1` çalışır | _doldur_ |
| `price_snapshots.unit_price_with_vat` var | aynı | _doldur_ |
| RPC `get_price_changes` çağrılabilir | `SELECT * FROM get_price_changes(7) LIMIT 1` çalışır | _doldur_ |

---

## QS-01 — Catalog scrape: tek ürün (US3 → DB)

Bir mevcut ürün kodu kullan (örn. ESP0192194'teki `118 049`):

```bash
npm run scrape:catalog -- --supplier enderyapi --product-code "118 049"
```

**Beklenen**:
- Komut başarıyla biter (`✓ 1 yazıldı / 0 hata`).
- DB'de `price_snapshots` tablosunda 1 yeni satır:

```sql
SELECT * FROM price_snapshots
WHERE product_id = (SELECT id FROM products WHERE code = '118 049')
ORDER BY observed_at DESC LIMIT 1;
```

- `unit_price_with_vat` ≈ 272,45 (₺); `vat_rate` = 0.20; `source` = 'catalog'; `list_price` = 430; `discount_text` = "+40%+12%".

| Doğrulama | Beklenen | Gerçek |
|-----------|----------|--------|
| Komut exit 0 | ✓ | _doldur_ |
| `price_snapshots` yeni satır | ✓ | _doldur_ |
| `unit_price_with_vat` doğru hesap | ✓ | _doldur_ |
| `vat_rate` 0.20 | ✓ | _doldur_ |
| `list_price`, `discount_text` dolu | ✓ | _doldur_ |
| Stdout'ta credentials YOK | ✓ (G8) | _doldur_ |

---

## QS-02 — Catalog scrape: toplu (5 ürün)

```bash
npm run scrape:catalog -- --supplier enderyapi --limit 5
```

**Beklenen**:
- 5 ürün için tek tek navigation + parse.
- En az 1 ürün için `✓ ... → ₺X,YZ` çıkar.
- Komut < 3 dk biter.

| Doğrulama | Beklenen | Gerçek |
|-----------|----------|--------|
| 5/5 başarı veya 4/5 partial OK | ✓ | _doldur_ |
| Toplam süre < 3 dk | ✓ | _doldur_ |
| `scrape_runs` audit row eklendi | status='success' veya 'partial' | _doldur_ |

---

## QS-03 — Empty state: yeterli geçmiş yok

Sadece 1 snapshot var (QS-01 sonrası, QS-02'den önce veya silinmiş halde):

```sql
DELETE FROM price_snapshots WHERE source = 'catalog';
-- sonra tek ürün scrape (QS-01)
```

Tarayıcı: `/dashboard/price-changes`

**Beklenen**:
- Empty state mesajı: "Karşılaştırma için en az 2 farklı tarihte snapshot gerekli. Birkaç gün sonra tekrar deneyin."
- Tablo render edilmez.

| Doğrulama | Beklenen | Gerçek |
|-----------|----------|--------|
| Empty state mesajı doğru | ✓ | _doldur_ |
| Komut hint görünür (opsiyonel) | ✓ | _doldur_ |

---

## QS-04 — Yapay fiyat değişikliği: ⚠ zam algılama (P1 ana yol)

Mevcut snapshot var; sentetik olarak yeni snapshot ekle (fiyat yukarı):

```sql
INSERT INTO price_snapshots (product_id, observed_at, unit_price_with_vat, vat_rate, source)
SELECT
  id,
  now(),
  300.00,         -- 272,45 → 300 → zam
  0.20,
  'catalog'
FROM products WHERE code = '118 049';
```

Tarayıcı: `/dashboard/price-changes` refresh.

**Beklenen**:
- "118 049 KANATLI ALÇIPAN DÜBELİ" satırı görünür.
- Eski fiyat: ₺272,45 / Yeni fiyat: ₺300,00 / Δ: +%10,1 (+₺27,55).
- "Siparişe git" link'i ESP0192194'e gider.

| Doğrulama | Beklenen | Gerçek |
|-----------|----------|--------|
| Satır görünür | ✓ | _doldur_ |
| Eski/yeni fiyat doğru | ✓ | _doldur_ |
| Δ% ve Δ₺ doğru hesap | ≈ +%10,1 / +₺27,55 | _doldur_ |
| "Siparişe git" link aktif | ESP0192194'e gider | _doldur_ |
| Sıralama yüzde DESC | ✓ | _doldur_ |

Cleanup:
```sql
DELETE FROM price_snapshots WHERE unit_price_with_vat = 300.00;
```

---

## QS-05 — Pencere genişliği filtresi (`?days=N`)

URL: `/dashboard/price-changes?days=30`

**Beklenen**:
- WindowFilter dropdown'da "30 gün" seçili.
- 30 gün penceresinde değişiklik varsa listede; yoksa empty state.

URL: `/dashboard/price-changes?days=0` (geçersiz)

**Beklenen**:
- Default 7'ye sessiz fallback; URL temizlenmez.

| Doğrulama | Beklenen | Gerçek |
|-----------|----------|--------|
| `?days=30` dropdown reflect | ✓ | _doldur_ |
| `?days=0` default'a fallback | ✓ | _doldur_ |
| `?days=abc` default'a fallback | ✓ | _doldur_ |

---

## QS-06 — Fiyat düşüşü filtresi (`?showDrops=1`)

Sentetik fiyat düşüşü:

```sql
-- Mevcut snapshot 272,45; bir önceki "yapay" eski snapshot ekle (daha yüksek)
INSERT INTO price_snapshots (product_id, observed_at, unit_price_with_vat, vat_rate, source)
SELECT id, now() - interval '3 days', 350.00, 0.20, 'catalog'
FROM products WHERE code = '118 049';
```

Tarayıcı: `/dashboard/price-changes` (default → boş, zam yok)
Tarayıcı: `/dashboard/price-changes?showDrops=1`

**Beklenen**:
- `showDrops=0` (default): satır gözükmez (düşüş).
- `showDrops=1`: satır görünür, Δ negatif (-₺77,55 / -%22,2 civarı).

| Doğrulama | Beklenen | Gerçek |
|-----------|----------|--------|
| Default'ta düşüş gözükmez | ✓ | _doldur_ |
| `showDrops=1` ile gözükür | ✓ | _doldur_ |
| Toggle UI URL'i güncelliyor | ✓ | _doldur_ |

Cleanup:
```sql
DELETE FROM price_snapshots WHERE unit_price_with_vat = 350.00;
```

---

## QS-07 — Ürün detay sayfası (P2)

`/dashboard/price-changes` satırına tıkla → `/dashboard/products/<uuid>`.

**Beklenen**:
- Header: "KANATLI ALÇIPAN DÜBELİ NO:2 (500)" / Marka: SEGNAN / Tedarikçi: Enderyapi B2B / KDV: %20.
- Mevcut KDV dahil fiyat: ₺272,45 (son snapshot).
- Snapshot tarihçesi tablosu: en az 1 satır (DESC sıralı).
- Sparkline: en az 2 nokta varsa SVG; 1 nokta varsa "—".
- "Bu ürünün geçtiği siparişler": ESP0192194 — 16.05.2026 — 2 PK × ₺227,04 = ₺454,08.
- "← Zamlananlara dön" + "← Dashboard'a dön" linkleri.

| Doğrulama | Beklenen | Gerçek |
|-----------|----------|--------|
| Header doğru | ✓ | _doldur_ |
| Mevcut fiyat doğru | ✓ | _doldur_ |
| Snapshot tablosu DESC | ✓ | _doldur_ |
| Sparkline 2+ nokta varsa render | ✓ | _doldur_ |
| Sipariş listesi en az 1 satır | ✓ | _doldur_ |
| Sipariş satırı clickable | `/dashboard/orders/<id>` | _doldur_ |

---

## QS-08 — 404: geçersiz ürün ID

URL: `/dashboard/products/00000000-0000-0000-0000-000000000000`

**Beklenen**: Next.js 404 sayfası veya custom "Ürün bulunamadı" mesajı.

| Doğrulama | Beklenen | Gerçek |
|-----------|----------|--------|
| 404 görünür | ✓ | _doldur_ |
| Dashboard nav korunur (top bar) | ✓ | _doldur_ |

---

## QS-09 — Sipariş detay → Ürün detay cross-link (005 reviz)

Tarayıcı: `/dashboard/orders/<id>` (örn. ESP0192194).

**Beklenen** (005'in `OrderDetailCard` revize):
- Ürün satırındaki ürün adı veya kodu **link**.
- Tıklayınca `/dashboard/products/<product_id>` açar.
- `order_items.product_id` NULL ise link **olmaz** (sadece text).

| Doğrulama | Beklenen | Gerçek |
|-----------|----------|--------|
| Item satırı link davranışı | ✓ (product_id varsa) | _doldur_ |
| URL doğru | `/dashboard/products/<uuid>` | _doldur_ |

---

## QS-10 — Top bar nav

Tarayıcı: `/dashboard`.

**Beklenen**:
- Top bar'da "Zamlananlar" link'i görünür.
- Tıklayınca `/dashboard/price-changes` açılır.
- Aktif sayfada `aria-current="page"`.

| Doğrulama | Beklenen | Gerçek |
|-----------|----------|--------|
| Top bar link var | ✓ | _doldur_ |
| Aktif state | aria-current | _doldur_ |

---

## QS-11 — TR karakter render (SC-007)

DB'de bir ürünün adında TR karakter var:

```sql
UPDATE products SET name = 'İÇ AÇILI DÜBEL (özel)' WHERE code = '118 049';
```

Tarayıcı: `/dashboard/price-changes` + ürün detay.

**Beklenen**:
- "İÇ AÇILI DÜBEL (özel)" doğru render (İ, Ç, Ö ses doğru).

Geri yükle:
```sql
UPDATE products SET name = 'KANATLI ALÇIPAN DÜBELİ NO:2 (500)' WHERE code = '118 049';
```

---

## QS-12 — Performance (SC-002)

DevTools Network tab. `/dashboard/price-changes` ilk yükleme (100 ürün × 20 snapshot veri yoksa skip):
- Total time: <2 sn
- Response size: <50 KB
- First Load JS: <110 KB

Sentetik veri ile test:
```sql
-- 100 ürün × 5 snapshot
INSERT INTO products (supplier_id, code, name, vat_rate)
SELECT
  (SELECT id FROM suppliers WHERE slug='enderyapi' LIMIT 1),
  'TEST-' || lpad(i::text, 4, '0'),
  'Test Ürün ' || i,
  0.20
FROM generate_series(1, 100) i;

INSERT INTO price_snapshots (product_id, observed_at, unit_price_with_vat, vat_rate, source)
SELECT
  p.id,
  now() - (i || ' days')::interval,
  100 + random() * 50,
  0.20,
  'catalog'
FROM products p, generate_series(0, 4) i
WHERE p.code LIKE 'TEST-%';
```

| Doğrulama | Beklenen | Gerçek |
|-----------|----------|--------|
| `/price-changes` <2sn (100 ürün) | ✓ | _doldur_ |
| RPC <200ms | ✓ | _doldur_ |
| First Load JS <110 KB | ✓ | _doldur_ |

Cleanup:
```sql
DELETE FROM price_snapshots WHERE product_id IN (SELECT id FROM products WHERE code LIKE 'TEST-%');
DELETE FROM products WHERE code LIKE 'TEST-%';
```

---

## Toplam doğrulama özeti

| SC | Doğrulandı? |
|----|-------------|
| SC-001 (2 click ile zamlananlar) | QS-04 |
| SC-002 (<2sn 100 ürün × 20 snapshot) | QS-12 |
| SC-003 (<3dk 20 ürün scrape) | QS-02 |
| SC-004 (%100 doğruluk zam algılama) | QS-04 + QS-06 |
| SC-005 (3 click ile tarihçe) | QS-04 → QS-07 |
| SC-006 (%90 başarı oranı toleransı) | QS-02 |
| SC-007 (TR karakter) | QS-11 |
| SC-008 (anonim redirect) | QS-00 |
| SC-009 (cross-link sipariş↔ürün) | QS-07 + QS-09 |
