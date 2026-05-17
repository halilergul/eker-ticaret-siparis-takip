# Quickstart: 008 İkizler + Levent Şimşek tedarikçileri

**Date**: 2026-05-17 | **Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

İmplementasyon sonrası iki tedarikçiyi production'da test etme akışı. Sıralı, her adım kontrol noktası.

## Ön gereksinimler

- Feature 007 production'da aktif (`https://eker-ticaret-siparis-takip.vercel.app/dashboard/settings` erişilebilir, "Şimdi tetikle" Enderyapi için çalışıyor).
- Geliştirici Supabase erişimi var (migration uygulamak için MCP veya CLI).
- Geliştirici GitHub repo Secrets erişimi var.
- Kullanıcı (Eker) **İkizler** ve **Levent Şimşek** B2B hesap bilgilerini güvenli şekilde geliştiriciye iletti (Bitwarden, password manager veya 1Password share link önerilir; düz e-posta önerilmez).

## 1. Seed migrations uygula (1 dk)

```typescript
// Migration 1: yeni tedarikçi satırları
mcp__supabase__apply_migration({
  name: "seed_ikizler_leventsimsek",
  query: `
    INSERT INTO public.suppliers (slug, name, base_url)
    VALUES
      ('ikizler', 'İkizler Hırdavat', 'http://bayi.ikizlerhirdavat.com'),
      ('leventsimsek', 'Levent Şimşek Armatür', 'https://liste.leventsimsekarmatur.com')
    ON CONFLICT (slug) DO NOTHING;
  `,
});

// Migration 2: scrape_schedule satırları
mcp__supabase__apply_migration({
  name: "seed_schedule_ikizler_leventsimsek",
  query: `
    INSERT INTO public.scrape_schedule (supplier_id, enabled, daily_hour_utc)
    SELECT id, false, 9 FROM public.suppliers
    WHERE slug IN ('ikizler', 'leventsimsek')
    ON CONFLICT (supplier_id) DO NOTHING;
  `,
});
```

**Doğrulama**:
```sql
SELECT slug, name FROM suppliers ORDER BY slug;
-- Beklenen: enderyapi, ikizler, leventsimsek

SELECT s.slug, ss.enabled, ss.daily_hour_utc
FROM suppliers s JOIN scrape_schedule ss ON ss.supplier_id = s.id
ORDER BY s.slug;
-- Beklenen: 3 satır, hepsi (false, 9) veya enderyapi için kullanıcı ayarı
```

## 2. Settings sayfasında 3 kart görünmesi (otomatik, kod değişikliği yok) (2 dk)

1. `/dashboard/settings` aç (geliştirici lokal veya prod).
2. **Beklenen**: 3 tedarikçi kartı sırayla:
   - Enderyapi B2B (mevcut)
   - İkizler Hırdavat (**yeni**)
   - Levent Şimşek Armatür (**yeni**)
3. Yeni kartlar `Manuel · — · — sipariş` placeholder ile görünür (henüz koşum yok).

**Doğrulama**: Server Component cache miss bekleniyor → hard refresh (Cmd+Shift+R) yeterli. Yine 3 kart görünmüyorsa `lib/queries/scrape-schedule.ts::listAllSchedules()` çıktısını kontrol et.

## 3. Adapter kodu deploy + local credentials test (15 dk per supplier)

### 3a. İkizler local smoke

`.env.local`'a ekle (geliştirici makinesinde, repo'ya commit edilmez):
```
IKIZLER_USERNAME=<kullanici_paylasti>
IKIZLER_PASSWORD=<kullanici_paylasti>
```

Headed mode ile test:
```bash
npm run scrape:all -- --supplier ikizler --skip-catalog --headed --verbose
```

**Beklenen çıktı** (örnek):
```
[scrape:all] Tedarikçi: İkizler Hırdavat (tetik: unknown)
[scrape:all] Login deneniyor...
[scrape:all] ✓ Login başarılı
[scrape:all] Sipariş listesi okunuyor...
[scrape:all] N sipariş bulundu
[scrape:all]   5/N işlendi
...
[scrape:all] Sipariş aşaması: N yeni, 0 mevcut
[scrape:all] Catalog atlandı (--skip-catalog)
[scrape:all] ✅ Başarılı (Xm Ys)
```

**Hata olursa**:
- `login-failed` → username/password kontrol.
- `unexpected-dom` (`login-form-locate`) → `--headed` + `scrape-debug/<runId>/login-page.png` incele, selector güncelle.
- `timeout` → site çevrimdışı veya yavaş; tekrar dene.

### 3b. İkizler idempotency

```bash
npm run scrape:all -- --supplier ikizler --skip-catalog
```

**Beklenen**: `Sipariş aşaması: 0 yeni, N mevcut` (`orders_skipped: N`).

### 3c. Levent Şimşek local smoke

`.env.local`'a ekle:
```
LEVENTSIMSEK_USERNAME=<kullanici_paylasti>
LEVENTSIMSEK_PASSWORD=<kullanici_paylasti>
```

```bash
npm run scrape:all -- --supplier leventsimsek --skip-catalog --headed --verbose
```

Aynı doğrulama akışı.

### 3d. Levent Şimşek idempotency

```bash
npm run scrape:all -- --supplier leventsimsek --skip-catalog
```

**Beklenen**: `0 yeni, N mevcut`.

## 4. Siparişler dashboard'da görünmesi (2 dk)

1. `/dashboard` aç.
2. **Tedarikçi filtresi** dropdown → 3 seçenek (Enderyapi, İkizler, Levent Şimşek).
3. **İkizler** seç → sadece İkizler siparişleri.
4. **Levent Şimşek** seç → sadece Levent Şimşek siparişleri.
5. Bir siparişe tıkla → detay sayfasında ürün satırları (kod, ad, miktar, birim fiyat) görünmeli.
6. Manuel karşılaştırma: B2B sitedeki aynı siparişe gir, **en az 3 örnek** için DB ile karşılaştır (SC-003).

## 5. GitHub Secrets göçü (5 dk)

Repo: `https://github.com/<owner>/eker-ticaret-siparis-takip/settings/secrets/actions`

Ekle (4 secret):
- `IKIZLER_USERNAME` → `<kullanici_paylasti>`
- `IKIZLER_PASSWORD` → `<kullanici_paylasti>`
- `LEVENTSIMSEK_USERNAME` → `<kullanici_paylasti>`
- `LEVENTSIMSEK_PASSWORD` → `<kullanici_paylasti>`

Workflow YAML'inde env mapping eklenmiş olmalı (T-implementation görevi):
```yaml
env:
  IKIZLER_USERNAME: ${{ secrets.IKIZLER_USERNAME }}
  IKIZLER_PASSWORD: ${{ secrets.IKIZLER_PASSWORD }}
  LEVENTSIMSEK_USERNAME: ${{ secrets.LEVENTSIMSEK_USERNAME }}
  LEVENTSIMSEK_PASSWORD: ${{ secrets.LEVENTSIMSEK_PASSWORD }}
```

Ve `supplier choice options` listesi:
```yaml
options:
  - enderyapi
  - ikizler
  - leventsimsek
```

## 6. Production smoke: "Şimdi tetikle" üzerinden test (10 dk per supplier)

### 6a. İkizler

1. `https://eker-ticaret-siparis-takip.vercel.app/dashboard/settings` aç.
2. İkizler kartında **"Şimdi tetikle"** butonuna bas.
3. Toast: "Tetiklendi (manuel)" — UI hemen yenilenir, "Son koşumlar"da `Manuel · Çalışıyor · —` satırı.
4. 5–10 dakika bekle (sayfayı yenile).
5. **Beklenen**: satır `Manuel · Başarılı · N sipariş · M satır` olur.
6. `/dashboard?supplier=ikizler` filtresi → siparişler görünür.

### 6b. Levent Şimşek

Aynı akış, "Levent Şimşek Armatür" kartı.

### 6c. Eşzamanlı tetikleme testi (opsiyonel)

İkizler "Şimdi tetikle" → 30sn sonra Levent Şimşek "Şimdi tetikle". GitHub Actions runner'larında 2 workflow paralel çalışmalı (`concurrency.group: scrape-${supplier}` farklı). Her ikisi de bağımsız tamamlanmalı.

## 7. Cron doğrulama (24 saat sonra) (5 dk)

1. Settings'te İkizler `enabled=true` + saat seç (ör. 12:00 İstanbul → UTC 09:00).
2. Levent Şimşek `enabled=true` + saat seç (ör. 13:00 İstanbul → UTC 10:00).
3. 24 saat içinde GitHub Actions sekmesinde 3 ayrı `Scrape` workflow run görünmeli:
   - UTC 09:00 — supplier=enderyapi, trigger_type=auto
   - UTC 09:00 veya yakın — supplier=ikizler, trigger_type=auto (enderyapı ile aynı dakika tetiklenirse paralel)
   - UTC 10:00 — supplier=leventsimsek, trigger_type=auto
4. `/dashboard/settings` "Son koşumlar"da 3 ayrı `Otomatik · Başarılı` satır.

## 8. Credentials sızıntı taraması (1 dk)

```bash
git grep -E "IKIZLER_(USERNAME|PASSWORD)|LEVENTSIMSEK_(USERNAME|PASSWORD)" -- . ':!.env.example' ':!**/specs/**' ':!**/.docs/**'
```

**Beklenen**: 0 finding. Kaynak kodda **placeholder** veya **referans** dışı (örn. `process.env.IKIZLER_USERNAME` kod referansı kabul; düz değer yasak).

```bash
git grep -E "(IKIZLER|LEVENTSIMSEK)_PASSWORD=[a-zA-Z0-9]" -- .
```

**Beklenen**: 0 finding. Hardcoded password yok.

## 9. Rollback Planı

Eğer adapter bir tedarikçi için problemli ise:

```sql
-- Tedarikçiyi geçici kapat (settings UI'sından da yapılabilir)
UPDATE scrape_schedule SET enabled = false WHERE supplier_id = (SELECT id FROM suppliers WHERE slug = 'ikizler');
```

Geliştirme tamamlanmadan üretime gitmiş test verisi varsa:
```sql
-- DİKKAT: gerçek kullanıcı verisi varsa silme!
DELETE FROM order_items WHERE order_id IN (
  SELECT id FROM supplier_orders WHERE supplier_id = (SELECT id FROM suppliers WHERE slug = 'ikizler')
);
DELETE FROM supplier_orders WHERE supplier_id = (SELECT id FROM suppliers WHERE slug = 'ikizler');
DELETE FROM scrape_runs WHERE supplier_id = (SELECT id FROM suppliers WHERE slug = 'ikizler');
```

`suppliers` ve `scrape_schedule` satırları kalır (UI'da "İkizler" görünür, ama yalnızca disabled & siparişsiz).

## Toplam Süre Tahmini

| Faz | Süre |
|-----|------|
| 1. Seed migrations | 1 dk |
| 2. Settings UI doğrulama | 2 dk |
| 3. Adapter implementasyonu + local test (per supplier) | 1–4 saat × 2 |
| 4. Dashboard doğrulama | 2 dk |
| 5. GitHub Secrets göçü | 5 dk |
| 6. Production smoke (per supplier) | 10 dk × 2 |
| 7. Cron doğrulama | 24 saat (bekleme) |
| 8. Sızıntı taraması | 1 dk |
| **Net çalışma** | ~3–8 saat (DOM keşfine bağlı) |
