# Quickstart: Yedekler İnşaat Smoke Test

**Plan**: [plan.md](./plan.md)  
**Tarih**: 2026-06-04

Bu doküman implementation sonrası 3 user story'nin yeşil olduğunu doğrulamak için manuel test akışlarını içerir.

---

## Ön Koşullar

- Local dev environment: Node 22, npm, repo clone (`010-yedekler-supplier` branch)
- `.env.local` dolu (3 Yedekler secret + Supabase URL + Service role key)
- Supabase MCP veya Supabase Studio erişimi (DB sorgulamak için)
- Playwright Chromium kurulu (`npx playwright install chromium` — gerekirse)

---

## P1 Test: Sipariş scrape (lokal) ✓

**Hedef**: Yedekler için sipariş scrape akışı end-to-end çalışıyor.

### Adımlar

1. **Migration uygula** (Supabase MCP veya CLI ile):
   ```
   supabase/migrations/20260605000000_seed_yedekler.sql
   ```
   Doğrulama:
   ```sql
   SELECT slug, name, base_url FROM suppliers WHERE slug='yedekler';
   -- Beklenen: 1 satır
   
   SELECT enabled, daily_hour_utc FROM scrape_schedule 
   WHERE supplier_id = (SELECT id FROM suppliers WHERE slug='yedekler');
   -- Beklenen: enabled=true, daily_hour_utc=3
   ```

2. **Sipariş scrape'i çalıştır** (catalog phase'i atlayarak):
   ```bash
   npm run scrape:all -- --supplier yedekler --skip-catalog
   ```
   
   Beklenen davranış: 
   - Login başarılı
   - Sipariş listesi parse edilir
   - En az 1 sipariş için detay alınır
   - DB'ye orders + order_items + products satırları yazılır
   - Script "✓ scrape success" mesajıyla biter, exit code 0

3. **DB doğrulama**:
   ```sql
   -- En son scrape run
   SELECT status, summary, started_at, finished_at, error_message
   FROM scrape_runs
   WHERE supplier_id = (SELECT id FROM suppliers WHERE slug='yedekler')
   ORDER BY started_at DESC LIMIT 1;
   -- Beklenen: status='success', summary.orders_total >= 1, errors=[]
   
   -- Çekilen siparişler
   SELECT order_no, ordered_at, status, total_amount
   FROM orders o
   WHERE supplier_id = (SELECT id FROM suppliers WHERE slug='yedekler')
   ORDER BY ordered_at DESC LIMIT 5;
   
   -- Sipariş kalemleri
   SELECT oi.product_id, p.code, p.name, oi.quantity, oi.unit_price_at_order
   FROM order_items oi
   JOIN orders o ON o.id = oi.order_id
   JOIN products p ON p.id = oi.product_id
   WHERE o.supplier_id = (SELECT id FROM suppliers WHERE slug='yedekler')
   LIMIT 10;
   ```

4. **Idempotency test**: Aynı komutu tekrar çalıştır.
   ```bash
   npm run scrape:all -- --supplier yedekler --skip-catalog
   ```
   ```sql
   -- order satır sayısı artmamalı
   SELECT COUNT(*) FROM orders WHERE supplier_id = ...;
   -- Aynı sayı kalmalı
   ```

5. **Dashboard görsel kontrol**:
   - `npm run dev` ile lokal yeşil server başlat
   - http://localhost:3000/dashboard aç
   - Sipariş listesi 4 tedarikçinin (Enderyapı + İkizler + Levent + Yedekler) siparişlerini gösteriyor
   - Tedarikçi filtresine "Yedekler İnşaat" seçeneği var
   - Yedekler siparişi tıklanınca detay sayfası açılıyor, ürünler listeleniyor

**Başarı Kriteri** (Spec SC-001): ilk koşum ≥1 sipariş + items; ikinci koşum duplicate yok.

---

## P2 Test: Catalog scrape (lokal)

**Hedef**: Yedekler catalog scrape akışı + zamlanan ürünler entegrasyonu çalışıyor.

### Adımlar

1. **Catalog scrape'i çalıştır**:
   ```bash
   npm run scrape:all -- --supplier yedekler
   ```
   (`--skip-catalog` YOK; orchestrator iki phase'i de çalıştırır)
   
   Beklenen: 
   - Sipariş scrape phase (P1'deki gibi)
   - Catalog scrape phase: ürün listesinden snapshot'lar
   - Toplam süre 5-8dk arasında

2. **DB doğrulama**:
   ```sql
   -- Catalog snapshot'lar
   SELECT COUNT(*), MIN(captured_at), MAX(captured_at)
   FROM product_price_snapshots pps
   JOIN products p ON p.id = pps.product_id
   WHERE p.supplier_id = (SELECT id FROM suppliers WHERE slug='yedekler');
   -- Beklenen: COUNT >= 10 (Yedekler catalog'unda en az 10 ürün varsa)
   
   -- Son scrape run summary
   SELECT summary FROM scrape_runs
   WHERE supplier_id = (SELECT id FROM suppliers WHERE slug='yedekler')
   ORDER BY started_at DESC LIMIT 1;
   -- Beklenen: summary.products_observed > 0, snapshots_added > 0
   ```

3. **Idempotency test**: Aynı gün ikinci kez tara.
   ```bash
   npm run scrape:all -- --supplier yedekler
   ```
   ```sql
   SELECT COUNT(*) FROM product_price_snapshots pps
   JOIN products p ON p.id = pps.product_id
   WHERE p.supplier_id = (SELECT id FROM suppliers WHERE slug='yedekler');
   -- Aynı sayı (yeni snapshot eklenmemeli)
   ```

4. **Zamlanan ürünler sayfası**:
   - http://localhost:3000/dashboard/zamlanan-urunler aç
   - Tedarikçi filtresinde "Yedekler İnşaat" var
   - Yedekler için snapshot varsa filtre seçildiğinde ürün listesi geliyor
   - **Not**: Fiyat değişikliği görülmesi için en az 2 snapshot gerek (farklı fiyatla). İlk koşumda yok; sonradan fiyat değişirse görünür.

5. **Hata izolasyon testi** (opsiyonel):
   - Geçici olarak `lib/scraper/adapters/yedekler.ts` içinde `scrapeCatalog` fonksiyonunda `throw new Error("test fail")` ekle
   - `npm run scrape:all -- --supplier yedekler` çalıştır
   - Beklenen: sipariş scrape başarılı, catalog phase failed; toplam run status `partial`
   - Test sonrası throw'u geri al

**Başarı Kriteri** (Spec SC-002, SC-005): ≥10 ürün snapshot; idempotent; catalog fail orders'ı engellemiyor.

---

## P3 Test: Production smoke (settings + cron)

**Hedef**: Settings UI'dan tetikleme ve scheduled cron Yedekler için çalışıyor.

### Adımlar

1. **GitHub Secrets ekle** (manuel):
   - Repo → Settings → Secrets → Actions → New repository secret
   - `YEDEKLER_CUSTOMER_CODE`, `YEDEKLER_USER_CODE`, `YEDEKLER_PASSWORD` (3 secret)
   - Değerleri `.env.local`'daki değerlerle aynı

2. **Vercel Environment Variables ekle** (manuel):
   - Vercel dashboard → eker-ticaret-siparis-takip → Settings → Environment Variables
   - Aynı 3 değişken (Production + Preview + Development hepsi)
   - Save

3. **Push & deploy**:
   ```bash
   git push origin 010-yedekler-supplier
   ```
   - Vercel preview deploy başlar; bekle
   - Master'a merge sonrası Vercel production deploy
   - Hata olursa Vercel dashboard → Deployments → log'a bak

4. **Settings UI testi**:
   - `https://siparis.ekerticaret.com.tr/dashboard/settings` aç
   - 4 TriggerCard görünüyor (Enderyapı + İkizler + Levent + Yedekler)
   - Yedekler kartında "Şimdi tetikle" butonuna bas
   - Kart "Çalışıyor" durumuna geçer + ProgressBar
   - GitHub Actions Run page'i aç (kartta link varsa veya repo'dan)
   - Run "Success" olduğunda settings kartı "Başarılı"ya döner

5. **DB doğrulama (production)**:
   ```sql
   SELECT status, trigger_type, summary
   FROM scrape_runs
   WHERE supplier_id = (SELECT id FROM suppliers WHERE slug='yedekler')
   ORDER BY started_at DESC LIMIT 1;
   -- Beklenen: trigger_type='manual', status='success' (P1+P2 başarı kriterleri)
   ```

6. **Scheduled cron testi**:
   - Bir sonraki cron pencereyi bekle (UTC 03:00 = TR 06:00, veya schedule'da ne ayarlandıysa)
   - Sonraki gün `scrape_runs` tablosuna `trigger_type=auto` ile bir Yedekler satırı eklenmiş olmalı
   - Settings sayfasında "Son otomatik koşum" tarihi güncel

7. **Regresyon kontrolü**:
   - /dashboard'da Enderyapı, İkizler, Levent siparişleri hâlâ görünüyor mu? (regresyon yok)
   - /dashboard/zamlanan-urunler'da diğer 3 tedarikçinin verisi etkilenmemiş

**Başarı Kriteri** (Spec SC-006, SC-007, SC-008): settings 2sn'de açılır, manuel tetik 5sn'de çalışır duruma geçer; cron çalışır; mevcut tedarikçiler etkilenmemiş.

---

## Sorun Giderme

### Login başarısız
- Diag script çalıştır: `npx tsx scripts/scrape-tools/yedekler-diag.ts --phase login`
- `tmp/yedekler-diag/login-screenshot.png` ve `login-html.txt`'i incele
- Selector'lar değişmiş mi, captcha gelmiş mi kontrol et
- `.env.local`'daki 3 değer doğru mu doğrula

### Sipariş listesi boş
- Site'de gerçekten sipariş var mı kontrol et (manuel login + visual check)
- Diag: `--phase orders` ile sipariş listesi sayfa HTML dump'ı al
- Selector adapter constants dosyasında doğru mu

### Catalog snapshot eklenmedi
- DB sorgu: `SELECT * FROM scrape_runs ... ORDER BY started_at DESC LIMIT 1` summary'sine bak
- `products_observed > 0` ama `snapshots_added = 0` ise: writer idempotency çalışmış (aynı fiyat) — normal
- `products_observed = 0` ise: catalog parse fail; diag çalıştır

### Settings sayfasında Yedekler kartı yok
- `suppliers` tablosunda satır var mı kontrol
- Migration prod DB'ye uygulanmış mı (Supabase MCP veya CLI)
- Browser cache temizle

### GitHub Actions Yedekler için çalışmıyor
- `.github/workflows/scrape.yml` choice'a `yedekler` eklendi mi
- Repo Secrets'a 3 değer eklendi mi
- Workflow Run log'larında env değişkenleri `***` olarak mask edilmiş olmalı (değer log'a düşmesin)

---

## Bitti Tanımı

Tüm 3 user story testi (P1, P2, P3) tamamlandığında feature 010 done sayılır. Constitution'a karar satırı eklenir (010'un kapanış commit'inde):

```
| 2026-06-XX | 010: Yedekler İnşaat 4. tedarikçi olarak eklendi (sipariş + catalog) | 3-alanlı login (customerCode + userCode + password) için loadYedeklerCredentials() ayrı export; mevcut 2-alanlı pattern'i generic'leştirmek yerine specialize karar; HTTP/HTTPS [keşif sonucu yazılır] |
```

(Tarih ve HTTP/HTTPS notu implementation sonrası kesinleşir.)
