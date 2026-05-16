# Quickstart — Manuel Doğrulama

**Feature**: 005-orders-dashboard | **Tarih**: 2026-05-16

Bu doküman implementasyon sonrası tarayıcıdan çalıştırılacak manuel test senaryolarını içerir. SC-001 → SC-008 bu senaryolarla doğrulanır.

**Ön koşul**:
- 001 auth çalışıyor (`/login` üzerinden giriş)
- 003 schema uygulandı
- 004 scraper en az 1 kez çalıştırıldı (DB'de en az birkaç sipariş var)
- `npm run dev` çalışıyor (`http://localhost:3000`)

---

## QS-00 — Hazırlık

```bash
npm run dev
```

```
http://localhost:3000 → login redirect
http://localhost:3000/dashboard → login redirect (anonim)
```

| Doğrulama | Beklenen | Gerçek |
|-----------|----------|--------|
| Anonim `/dashboard` | `/login`'e redirect | _doldur_ |
| Build clean | `npx tsc --noEmit` OK | _doldur_ |

---

## QS-01 — User Story 1: Sipariş listesi (P1 MVP)

1. `/login` → kullanıcı adı + şifre (001'deki).
2. Sonra `/dashboard` görüntülenir.

**Beklenen**:
- Tablo render edilir: sütun başlıkları "Sipariş No / Tedarikçi / Durum / Tarih / Tutar".
- 004'ten yazılan ~5 sipariş tabloda en yeni başta sıralı.
- Tarih TR format: `16.05.2026` veya "X gün önce".
- Tutar TR format: `544,90 ₺`.

| Doğrulama | Beklenen | Gerçek |
|-----------|----------|--------|
| Sütun başlıkları doğru | ✓ | _doldur_ |
| Satır sayısı = DB sipariş sayısı | ✓ | _doldur_ |
| `ordered_at DESC` sıralı | ✓ | _doldur_ |
| Tarih TR locale | `16.05.2026` veya `X gün önce` | _doldur_ |
| Tutar TR locale | `1.234,56 ₺` formatında | _doldur_ |
| İlk paint <2sn | ✓ | _doldur_ |
| TR karakter (`Onaylandı`) sağlam | ✓ | _doldur_ |

---

## QS-02 — Empty state

**Senaryo**: DB'deki tüm siparişleri sil (test için).

```sql
-- Geçici: tüm orders sil (cascade ile items da silinir)
DELETE FROM public.supplier_orders;
```

Tarayıcı: `/dashboard` refresh.

**Beklenen**:
- Empty state mesaj: "Henüz sipariş yok."
- Komut hint: `npm run scrape -- --supplier enderyapi` (monospace, copy butonu).
- Tablo render edilmez.

| Doğrulama | Beklenen | Gerçek |
|-----------|----------|--------|
| "Henüz sipariş yok" görünür | ✓ | _doldur_ |
| Scraper komutu görünür (monospace) | ✓ | _doldur_ |
| Copy butonu var | ✓ (opsiyonel) | _doldur_ |

Geri yükle:
```bash
npm run scrape -- --supplier enderyapi --limit 5 --skip-catalog
```

---

## QS-03 — Filter: supplier (P2)

Sentetik 2. supplier ekle:

```sql
INSERT INTO public.suppliers (slug, name, base_url)
VALUES ('acme-test', 'Acme Test B2B', 'https://b2b.acme.example');

-- Ona bir sipariş ekle:
WITH s AS (SELECT id FROM public.suppliers WHERE slug='acme-test')
INSERT INTO public.supplier_orders (supplier_id, order_no, status, ordered_at, total_amount)
SELECT s.id, 'ACME-001', 'Onaylandı', '2026-05-15T10:00:00Z', 999.99 FROM s;
```

Tarayıcı: `/dashboard` refresh. Şimdi en az 6 satır var (5 enderyapi + 1 acme).

Filter dropdown'undan "Acme Test B2B" seç.

**Beklenen**:
- URL: `/dashboard?supplier=acme-test`.
- Tabloda sadece 1 satır (ACME-001).
- Dropdown "Acme Test B2B" seçili kalır.

| Doğrulama | Beklenen | Gerçek |
|-----------|----------|--------|
| URL `?supplier=acme-test` set | ✓ | _doldur_ |
| Tabloda 1 satır | ✓ | _doldur_ |
| Dropdown seçim korunur | ✓ | _doldur_ |
| Geri butonuyla URL korunur | ✓ | _doldur_ |

Temizle:
```sql
DELETE FROM public.supplier_orders WHERE order_no = 'ACME-001';
DELETE FROM public.suppliers WHERE slug = 'acme-test';
```

---

## QS-04 — Filter: status (P2)

Tarayıcı: `/dashboard`. Filter "Durum: Onaylandı" seç.

**Beklenen**:
- URL: `/dashboard?status=Onayland%C4%B1` (URL-encoded TR karakter).
- Sadece status='Onaylandı' siparişler görünür (004 datasında 2 sipariş).

| Doğrulama | Beklenen | Gerçek |
|-----------|----------|--------|
| URL TR karakter encoded | `%C4%B1` görülür | _doldur_ |
| Filtered rows = beklenen sayı | ✓ | _doldur_ |
| Dropdown distinct status'lar | DB'den dinamik | _doldur_ |

---

## QS-05 — Filter kombinasyonu + temizle

1. Filter: "Tedarikçi: Enderyapi" + "Durum: Onaylandı".
2. URL: `/dashboard?supplier=enderyapi&status=Onaylandı`.
3. Tabloda Enderyapi'nin onaylanmış siparişleri.
4. "Filtreleri temizle" link tıkla.
5. URL: `/dashboard` (param'sız), tablo tüm siparişler.

| Doğrulama | Beklenen | Gerçek |
|-----------|----------|--------|
| Kombo filter doğru sonuç | ✓ | _doldur_ |
| "Temizle" linki URL sıfırlar | ✓ | _doldur_ |
| Sonrasında tüm satırlar görünür | ✓ | _doldur_ |

---

## QS-06 — Sipariş detayı (P3)

Tabloda bir satıra tıkla (örn. ESP0192194).

**Beklenen**:
- URL: `/dashboard/orders/<uuid>` (bookmark'lanabilir).
- Sayfa header: "Sipariş ESP0192194" + tedarikçi + tarih + durum.
- İçindeki ürün satırları listelenir (004 datasında 1 satır).
- Toplam: hesaplanan Σ vs `total_amount` eşit.

| Doğrulama | Beklenen | Gerçek |
|-----------|----------|--------|
| Detay URL doğru | `/dashboard/orders/<uuid>` | _doldur_ |
| Order no header görünür | ✓ | _doldur_ |
| Item satırları render | ✓ (en az 1) | _doldur_ |
| `qty × unit = lineTotal` doğru | ✓ | _doldur_ |
| `Σ lineTotal ≈ total_amount` (±0.01 tolerans) | ✓ | _doldur_ |
| Geri butonuyla `/dashboard` filter URL korunur | ✓ | _doldur_ |

---

## QS-07 — 404: bilinmeyen sipariş ID

URL: `/dashboard/orders/00000000-0000-0000-0000-000000000000`.

**Beklenen**:
- Next.js 404 sayfa veya custom "Sipariş bulunamadı" mesajı.
- Dashboard'a dön linki (opsiyonel).

| Doğrulama | Beklenen | Gerçek |
|-----------|----------|--------|
| 404 görünür | ✓ | _doldur_ |
| Dashboard nav korunur (top bar) | ✓ | _doldur_ |

---

## QS-08 — Data quality flag (SC-007)

Sentetik: bir siparişin `total_amount`'ını bilerek farklı bir değere set et.

```sql
-- Eğer veri yoksa skip; varsa örnek
UPDATE public.supplier_orders
SET total_amount = 9999.99
WHERE order_no = 'ESP0192194';
```

Tarayıcı: detay sayfası.

**Beklenen**:
- Hesaplanan toplam ≠ `total_amount` (9999.99).
- UI'da ⚠ badge veya "Veri tutarsız" uyarı.

| Doğrulama | Beklenen | Gerçek |
|-----------|----------|--------|
| Uyarı badge görünür | ✓ | _doldur_ |
| Hem hesaplanan hem DB değeri yazılır | ✓ | _doldur_ |

Geri yükle:
```sql
UPDATE public.supplier_orders SET total_amount = 544.90 WHERE order_no = 'ESP0192194';
```

---

## QS-09 — TR karakter render (SC-004)

DB'de bir siparişin status'unu "İptal Edildi" yap (büyük İ, küçük ı):

```sql
UPDATE public.supplier_orders SET status = 'İptal Edildi' WHERE order_no = 'ESP0192194';
```

Tarayıcı: `/dashboard` refresh + detay.

**Beklenen**:
- "İptal Edildi" doğru render (büyük İ noktayla, küçük l).
- Filter dropdown'da "İptal Edildi" görünür.
- Filter seçildiğinde URL encoded doğru (`%C4%B0ptal%20Edildi`).

| Doğrulama | Beklenen | Gerçek |
|-----------|----------|--------|
| `İ, ı, ş, ğ, ç, ö, ü` doğru render | ✓ | _doldur_ |
| Filter encoded URL TR karakteri çözer | ✓ | _doldur_ |

Geri yükle:
```sql
UPDATE public.supplier_orders SET status = 'Onay bekliyor' WHERE order_no = 'ESP0192194';
```

---

## QS-10 — Performance (SC-002)

DevTools Network tab. `/dashboard` ilk yükleme:
- Total time (TTFB + render): <2 saniye.
- Response size: <50 KB (Server Component HTML).

Sentetik 500 sipariş için (bu projede mümkünse):
- Total time: <4 saniye.
- Sipariş üretmek için bir loop script gerekir; V1 doğrulamada skip edilebilir.

| Doğrulama | Beklenen | Gerçek |
|-----------|----------|--------|
| 50 sipariş <2sn FCP | ✓ | _doldur_ |
| 500 sipariş <4sn | (skip OK) | _doldur_ |

---

## Toplam doğrulama özeti

| SC | Doğrulandı? |
|----|-------------|
| SC-001 (2 click ile liste) | QS-01 |
| SC-002 (<2sn 50 sipariş) | QS-10 |
| SC-003 (filter <1sn) | QS-03/04 |
| SC-004 (TR karakter) | QS-09 |
| SC-005 (empty state komut hint) | QS-02 |
| SC-006 (anonim redirect) | QS-00 |
| SC-007 (data quality flag) | QS-08 |
| SC-008 (tüm metin TR) | QS-01 + tüm sayfa |
