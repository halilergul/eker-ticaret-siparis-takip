# Teknik Gotcha'lar ve Bilinen Sorunlar

## Nasıl kullanılır

Geliştirme sırasında keşfedilen, sonraki oturumda bilmen gereken
teknik tuzaklar, sürprizler ve dikkat edilmesi gereken noktalar buraya kaydedilir.

Agent'lar bu dosyayı şu durumlarda günceller:
- Beklenmedik bir davranış keşfedildiğinde
- Bir hatanın kök nedeni bulunduğunda
- Belirli bir kütüphane veya altyapıyla ilgili kritik bilgi öğrenildiğinde
- "Bunu daha önce bilseydim saatlerimi kurtarırdım" niteliğinde bilgi

## Format

```
### [Kısa başlık]
- **Tarih:** YYYY-MM-DD
- **Konu:** Frontend / Backend / Mobil / Veritabanı / Altyapı / Tooling
- **Detay:** Ne oluyor ve neden oluyor?
- **Çözüm/Önlem:** Nasıl ele alınmalı?
```

---

## Kayıtlar

### `next lint` Next.js 16'da kaldırılıyor
- **Tarih:** 2026-05-16
- **Konu:** Tooling
- **Detay:** `npm run lint` çalıştırıldığında uyarı çıkıyor: `next lint is deprecated and will be removed in Next.js 16`. Şu an için çalışıyor ama ileride `next lint` yerine doğrudan `eslint .` (veya `npx eslint`) çağırmamız gerekecek.
- **Çözüm/Önlem:** Next.js 16 yükseltmesinde migration: `npx @next/codemod@canary next-lint-to-eslint-cli .`. `package.json` script'i `eslint .`'e dönüşür. Şimdilik aciliyeti yok; not olarak tutuluyor.

### Server Action + `useActionState` ile prevState kullanımı
- **Tarih:** 2026-05-16
- **Konu:** Frontend / React 19
- **Detay:** React 19 `useActionState` hook'u Server Action'a `(prevState, formData)` imzasıyla çağrı yapar. Eski stil `(formData)` Server Action ile uyumlu değil. `LoginForm` → `signIn(prevState, formData)` imzasını kullanır; aksi takdirde TypeScript hata vermese de runtime'da `formData` undefined olur.
- **Çözüm/Önlem:** Server Action başında `_prevState: ...State` parametresi tanımla; hook tarafında `useActionState<State, FormData>(action, initialState)` formatını koru.

### Türkçe karakter — UTF-8 her yerde
- **Tarih:** 2026-05-16
- **Konu:** i18n
- **Detay:** Next.js 15 + Tailwind 4 + React 19 stack'inde TR karakterler (`ı, İ, ş, ğ, ç, ö, ü`) hem JSX'te hem HTML meta'da hem form input'unda sorunsuz render oluyor; <html lang="tr"> ve UTF-8 default'u yeterli. Şifrede TR karakter de Supabase Auth tarafından sorun yaşatmıyor (HTTP body UTF-8 default).
- **Çözüm/Önlem:** Özel önlem gerekmiyor; ancak email collation arama yaparken `pg_trgm` yerine `pg_trgm + unaccent` kombinasyonu ileride lazım olabilir (henüz arama yok).

### Playwright Chromium binary cache konumu
- **Tarih:** 2026-05-16
- **Konu:** Tooling / Scraper
- **Detay:** `npx playwright install chromium` ~150 MB Chromium binary'sini `~/Library/Caches/ms-playwright/` (macOS) altına indirir. node_modules'de değil, ortak cache. Bir kez kurulur. CI'da (sonraki feature) cache key olarak playwright version + OS kullanılır.
- **Çözüm/Önlem:** Yeni geliştirici ortamında script ilk çalıştırılırken `Executable doesn't exist` hatası verirse `npx playwright install chromium` çalıştırılır.

### Scraper selector'ları "best guess" — gerçek site keşfi sonrası daralt
- **Tarih:** 2026-05-16
- **Konu:** Scraper / 002
- **Detay:** `scripts/scrape/constants.ts`'teki `LOGIN_SELECTORS`, `ORDER_LIST_SELECTORS`, `PRODUCT_DETAIL_SELECTORS` aday array'leri yaygın pattern'ları içerir ama b2b.enderyapi.com.tr'nin gerçek DOM yapısı keşfedilmemiştir (kod yazarken canlı siteyi göremedim). İlk koşmada `--verbose` ile hangi selector eşleştiği log'a yansır. Selector listesi daralarak sabitlenmeli.
- **Çözüm/Önlem:** PoC sonrası "winning selector"ları array'in başına taşı; veya pragmatik olarak tek sabit selector'a indir. Çok aday selector → ilk koşmaları yavaşlatabilir (her birini test ediyor).

### TR fiyat parse edge case'i: sadece nokta + 3 hane = binlik mi ondalık mı?
- **Tarih:** 2026-05-16
- **Konu:** i18n / Scraper
- **Detay:** `"1.234"` formatı belirsiz: Türkiye'de binlik (1234) ama US format'ta ondalık (1.234). `parseTrPrice` pragmatik kural kullanır: 3 haneli son grup varsa binlik kabul. `"1.5"` → ondalık (1.5), `"1.234"` → binlik (1234). Tek başına yanlış pozitif olabilir; gerçek veriden gözlemleyip ayarla.
- **Çözüm/Önlem:** Eğer scraper testinde fiyatlar yanlış yorumlandıysa (örn. 1.234 ₺ → 1234 görünmeli ama 1.234 olarak parse edildi), `price-parse.ts`'i ayarla.

### b2b.enderyapi.com.tr — site yapı bulguları (PoC sonucu)
- **Tarih:** 2026-05-16
- **Konu:** Scraper / Site keşfi
- **Detay:** PoC çalıştırması sırasında öğrenilen yapı:
  - **Frontend:** SPA (React veya Vue muhtemel) — "Bu site B2B Store altyapısını kullanmaktadır" footer'ı var
  - **Login URL:** `https://b2b.enderyapi.com.tr/login`
  - **Login form selector'ları:** `input[id*="user" i]` (username), `input[type="password"]`, `button:has-text("Giriş Yap")` (submit)
  - **Login akışı:** AJAX submit → "Giriş yapılıyor..." spinner → JS redirect (≈3-5 sn). `domcontentloaded` yetmez, **URL change** veya **networkidle** beklemek şart.
  - **Sipariş listesi URL:** `/tr` (login sonrası ana sayfa) veya `/siparislerim` benzeri
  - **Sipariş satırı içeriği:** `sipariş_no (ESP018xxxx-ESP019xxxx) — durum (Onaylandı/Onay bekliyor) — tarih (DD.MM.YYYY) — toplam_tutar (₺)`. ÜRÜN değil, **sipariş özeti**.
  - **Sipariş detay URL'i:** `/tr/siparis-detay?id=<numerik-id>` (örn. `id=45007505`). Sipariş içindeki ürün satırları burada.
  - **Ürün katalog URL'i:** Henüz keşfedilmedi. 003+ feature'da gerekiyor: ürün kodu → katalog sayfası → güncel birim fiyat.
- **Çözüm/Önlem:** 003'te schema iki-seviyeli yapıyı yansıtmalı (orders + order_items). 004'te scraper iki drill-down + bir katalog ziyaret yapacak.

### Playwright SPA timing — `domcontentloaded` yetersiz
- **Tarih:** 2026-05-16
- **Konu:** Tooling / Scraper
- **Detay:** SPA siteler submit/navigation sonrası DOM'u JS ile yeniler. `page.goto({ waitUntil: "domcontentloaded" })` HTML iskeleti yüklenir yüklenmez döner; bizim ihtiyacımız olan içerik (login redirect, fiyat değerleri, vb.) henüz JS ile basılmamıştır.
- **Çözüm/Önlem:** Üç pattern:
  1. **URL change:** `page.waitForURL((url) => !url.includes("/login"), { timeout: 15000 })` — başarılı yönlendirmeyi yakalar
  2. **Network idle:** `page.waitForLoadState("networkidle", { timeout: 10000 })` — XHR'lar dindiğinde
  3. **Spesifik element:** `page.waitForSelector(".dashboard-loaded", { timeout: 10000 })` — bilinen bir element render olduğunda
  4. Genelde 1 + 2'yi try/catch ile chain etmek robust olur. `enderyapi.ts`'te bu pattern var.
