# Phase 0 — Research: Enderyapi Scraper PoC

**Date**: 2026-05-16
**Status**: Complete (no `[NEEDS CLARIFICATION]` markers; tüm teknik kararlar burada belgelendi)

---

## R-001 — Browser automation: Playwright mi, Puppeteer mı, Selenium mı?

**Decision**: **Playwright** (Chromium).

**Rationale**:
- Modern (2020+), aktif geliştirilen Microsoft projesi
- TypeScript first-class destek
- Built-in auto-wait, smart selectors (`getByRole`, `getByText`, `getByLabel`)
- CONSTITUTION'da scrape job için zaten Playwright öneriyor
- Cross-browser (Chromium/Firefox/WebKit) ama biz sadece Chromium
- Built-in screenshot, video, trace; debugging mükemmel
- GitHub Actions için hazır container image var (005'te kullanılacak)

**Alternatives considered**:
- **Puppeteer**: Chrome-only; Playwright bunun "spiritual successor"u, aynı ekip geliştirmişti
- **Selenium**: Daha eski, daha karmaşık setup, JS ile çalışırken Playwright kadar ergonomik değil
- **fetch + cheerio**: Tek başına yeterli değil — JS render gereken sayfalar var (büyük ihtimalle), login form'u CSRF token gerektirebilir, cookie management manuel

---

## R-002 — Script çalıştırma: `tsx` mi, `node + tsc build` mi, `bun` mu?

**Decision**: **`tsx`** ile doğrudan TypeScript dosyasını çalıştır.

**Rationale**:
- `tsx scripts/scrape/enderyapi.ts` — zero-config, hızlı
- Build step yok, geliştirici sürtünmesi minimal
- TypeScript strict mode'u korur
- `npm run scrape:enderyapi` script'i: `tsx scripts/scrape/enderyapi.ts`
- `tsx` esbuild kullanır — milisaniye seviyesinde başlangıç

**Alternatives considered**:
- `ts-node`: Daha yavaş, `tsx` artık endüstri standardı
- `tsc` ile derle + `node`: Build step ek karmaşıklık
- Bun: Cazip ama proje stack'inde yok; ek runtime dependency PoC için fazla

---

## R-003 — `.env.local` okuma: Next.js (otomatik) vs `dotenv` (manuel)?

**Decision**: **`dotenv`** explicit `.config({ path: ".env.local" })` ile.

**Rationale**:
- Script Next.js bağlamı dışında çalışıyor (`tsx scripts/scrape/enderyapi.ts`), Next.js'in otomatik env loading'i yok
- `dotenv` küçük ve standart; tek satırda yüklenir
- `.env.local` Next.js'in default'u; biz de aynı dosyaya bakarız → kullanıcı bir kez env yazsın, hem Next.js hem script görsün

**Alternatives considered**:
- Node 22 native `--env-file`: Çalışır ama `npm run scrape:enderyapi` script'inde ek flag eklemek gerekir, `tsx`'le birlikte test edilmemiş
- Manuel `fs.readFileSync(".env.local") + parse`: Reinvent the wheel

---

## R-004 — CLI argüman parsing: `commander`, `minimist`, native, yoksa `yargs`?

**Decision**: **Native (`process.argv.slice(2)` + minimal parse)**.

**Rationale**:
- 3 flag var: `--json`, `--headed`, `--verbose`. Hepsi boolean.
- Yeni library eklemek (commander/yargs) → PoC için aşırı; ~20 satırlık parse fonksiyonu yeterli
- Hata mesajları üzerinde tam kontrol (Türkçe)
- 004'te adapter abstraction'a geçince CLI ihtiyacı azalır; library'yi şimdi eklemek kullanılmadan kalır

**Alternatives considered**:
- `commander`: Standart, güzel; ama PoC için fazla — 3 boolean flag basit if/else
- `minimist`: Daha küçük ama bakım az; `commander` ile tradeoff dar
- `yargs`: Daha büyük, command pattern; YAGNI

---

## R-005 — Headless mı headed mı default?

**Decision**: **Default headless** (`{ headless: true }`); `--headed` flag'i ile override.

**Rationale**:
- Production-grade niyetler: CI'da headless çalışır
- PoC sırasında ne olduğunu görmek istersek `--headed` ile aç
- Headless detection riski varsa R-009'da ele alıyoruz

**Alternatives considered**:
- Default headed: Geliştiricinin makinesinde browser açar her seferinde; sıkıcı, CI'da çalışmaz
- Default config dosyası: Aşırı

---

## R-006 — Login flow: form submit mi, REST endpoint mi?

**Decision**: **Form submit** — Playwright `page.fill()` + `page.click('button[type=submit]')`.

**Rationale**:
- Site keşfi yapılmamış; büyük ihtimal standard form-based login
- CSRF token varsa Playwright tarayıcı olarak göndereceği için otomatik halleder
- REST endpoint reverse engineering daha kırılgan (header'lar, body format, CSRF)

**Alternatives considered**:
- Direct HTTP POST + axios: CSRF/cookie session yönetimi karmaşık; site key endpoint'leri ifşa etmiyor olabilir
- Reuse mevcut cookie (manual export): Çok hand-crafted, otomasyon değil

---

## R-007 — "Sipariş geçmişi" sayfasının URL'i nasıl bulunacak?

**Decision**: **Çok aşamalı keşif**:
1. İlk implementasyon: `https://b2b.enderyapi.com.tr/account/orders`, `/siparislerim`, `/orders` gibi yaygın URL'leri sırayla dene
2. Hiçbiri çalışmazsa: login sonrası ana sayfada "Siparişlerim" / "Sipariş Geçmişi" / "Orders" link'ini text/role ile bul ve tıkla
3. Tıklama sonrası landing URL'i log'a yaz (`--verbose` mode'da) — gelecek koşmalar için sabitlenebilir

**Rationale**:
- Site DOM'unu henüz görmedik; pragmatik keşif gerekli
- Link-by-text fallback resilient (URL değişse de menü tipik aynı)

**Alternatives considered**:
- Hard-code URL: Sabit, ama henüz bilmiyoruz
- Sadece text-based link: İlk denemede yavaş — URL biliniyorsa direkt git daha hızlı

---

## R-008 — Selector strategy: ID/class mı, role mü, text mi?

**Decision**: **Role + text** (Playwright `getByRole`, `getByText`) öncelikli; class fallback.

**Rationale**:
- Accessible selector'lar (role/text) DOM yapısı değiştiğinde kırılgan değil
- CSS class isimleri genelde build-time'da değişebilir; role/text stabil
- PoC için: önce role/text dene, çalışmazsa class/id'ye düş

**Alternatives considered**:
- XPath: Verbose, modern Playwright'ta tercih edilmez
- Sadece CSS selector: Brittle
- Data-test-id: Site bizim değil, koyamayız

---

## R-009 — Bot detection ve CAPTCHA tespit: hangi sinyaller?

**Decision**: Aşağıdaki sinyalleri sırayla kontrol et:
1. Sayfa URL'inde `cloudflare`, `challenge`, `captcha`, `bot`, `verify` keyword'leri
2. Sayfa içeriğinde:
   - "checking your browser" / "tarayıcınız kontrol ediliyor"
   - "I'm not a robot" / "Robot değilim"
   - `iframe[src*="recaptcha"]`, `iframe[src*="hcaptcha"]`
   - `.cf-challenge`, `.captcha-container` class'ları
3. HTTP 403 + body'de yukarıdakilerden biri
4. 5 saniye içinde herhangi bir input/link tıklanabilir hale gelmiyorsa şüpheli

**Decision (mesaj)**:
- Cloudflare/JS challenge: "Bot koruması algılandı (Cloudflare challenge)"
- reCAPTCHA: "CAPTCHA tespit edildi (Google reCAPTCHA)"
- hCaptcha: "CAPTCHA tespit edildi (hCaptcha)"
- Generic: "CAPTCHA / bot koruması algılandı (tip: bilinmiyor)"

**Rationale**:
- Çok kaynaklı sinyal → false-positive azalır
- Spesifik mesaj → hangi koruma var, nasıl bypass edilmesi gerektiğini hızlıca anlamak için

**Alternatives considered**:
- ML/heuristic: Aşırı; basit pattern match yeterli
- Stealth plugin'leri (playwright-extra/stealth): Anti-detection — kapsam dışı (Out of Scope), PoC'un öğrenmesi gereken bir şey

---

## R-010 — 2FA tespit

**Decision**: Login submit sonrası landing URL veya sayfa içeriğinde:
- "2FA", "iki faktörlü", "doğrulama kodu", "SMS kodu", "Authenticator"
- `input[name*="code"]`, `input[name*="otp"]`, `input[name*="token"]` görünür ve odakta

**Mesaj**: "2FA gerekli — PoC kapsam dışı (SMS/OTP/Authenticator alanı algılandı)"

**Rationale**:
- B2B siteleri çoğunlukla 2FA istemez ama tedbir
- Bulunursa script durur — bypass yok (Out of Scope)

---

## R-011 — TR locale fiyat parse: "1.234,56 ₺" → number

**Decision**: Custom `parseTrPrice(raw: string): number | null` fonksiyonu.

Algoritma:
1. Trim
2. Currency sembollerini ve TL/TRY harflerini sil (`₺`, `TL`, `TRY`)
3. Whitespace temizle
4. Eğer hem `.` hem `,` varsa: nokta = binlik, virgül = ondalık → `replace(/\./g, "").replace(",", ".")`
5. Sadece `,` varsa: ondalık → `replace(",", ".")`
6. Sadece `.` varsa: ambigu (binlik mi, ondalık mı?) → Türkiye'de genellikle binlik ama küçük fiyatlarda ondalık olabilir. Karar: virgül yoksa nokta = ondalık (US format değil ama uyarı eklersek false-positive olur)
7. `Number()` ile parse; NaN → null + edge case not'u

**Edge case'ler**:
- `12,50 ₺` → `12.50` ✅
- `1.234,56 ₺` → `1234.56` ✅
- `1234.56 ₺` → `1234.56` (sadece nokta varsa ondalık kabul; 1.234 vs 1234 belirsizliği taşıyor; uyarı bas)
- `1.234 ₺` → `1234` (binlik yorum)
- Empty/null/garbage → null + warning

**Alternatives considered**:
- `Intl.NumberFormat` reverse: Tam reverse parse desteklenmiyor
- 3rd party (`numeral.js`, `accounting`): Library eklemeye değmez

---

## R-012 — Screenshot kaydı: nereye, nasıl, isim formatı

**Decision**:
- Klasör: `scrape-debug/` (repo kökünde, gitignored)
- Dosya adı: `<ISO-timestamp>-<failure-mode>.png` (örn. `2026-05-16T20-30-45-captcha.png`)
- `:` karakteri Windows için sorunlu → `-` ile değiştir
- Failure mode kategori: `login-failed`, `captcha`, `2fa`, `network`, `unexpected-dom`, `timeout`, `cookie-banner-block`
- Şifre asla dosya adında yok (FR-019)

**Rationale**:
- Timestamp → debugging için zaman bilgisi
- Failure mode kategorisi → klasörde göz gezdirince hangi hata olduğu hemen belli
- ISO format → sıralama doğal

**Alternatives considered**:
- Tek `latest.png`: Birden fazla deneme yapınca üst yazar; debugging için tarih kaybı
- UUID isim: Anlamsız

---

## Özet

| ID | Karar | Tip |
|----|-------|-----|
| R-001 | Playwright (Chromium) | Tool |
| R-002 | `tsx` ile doğrudan çalıştırma | Toolchain |
| R-003 | `dotenv` ile `.env.local` okuma | Env |
| R-004 | Native arg parsing | CLI |
| R-005 | Default headless, `--headed` override | Mode |
| R-006 | Form submit ile login | Auth |
| R-007 | Aşamalı URL keşfi: bilinen path'ler → text link | Navigation |
| R-008 | Role + text selector öncelikli | DOM |
| R-009 | Çok kaynaklı bot/CAPTCHA tespit | Detection |
| R-010 | 2FA pattern match → durdur | Detection |
| R-011 | Custom TR fiyat parser | i18n |
| R-012 | `scrape-debug/<ts>-<mode>.png` | Debug artifacts |

Tüm kararlar belirlendi. PoC'un karakteri keşif olduğu için bazı kararlar (R-007, R-009) ilk implementasyonda esnek bırakılıp gerçek site karşısında daraltılacak.
