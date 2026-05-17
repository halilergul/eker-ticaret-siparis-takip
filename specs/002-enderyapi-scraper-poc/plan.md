# Implementation Plan: Enderyapi Scraper PoC

**Branch**: `002-enderyapi-scraper-poc` | **Date**: 2026-05-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-enderyapi-scraper-poc/spec.md`

**Note**: This plan covers Phase 0 (research) and Phase 1 (design). Tasks are produced by `/speckit-tasks`.

## Summary

Standalone CLI script (Next.js/Vercel runtime'ından bağımsız, doğrudan `tsx`/`node` ile çalışır) `b2b.enderyapi.com.tr`'ye Playwright (Chromium, headless default) ile login olur, sipariş geçmişi sayfasındaki ilk sayfayı parse eder, her sipariş satırı için **ürün adı + tarih + alış fiyatı + güncel fiyat** çıktısı verir (düz metin veya `--json` ile JSON). Tüm hata yolları (yanlış kimlik, CAPTCHA, 2FA, ağ, beklenmedik DOM, timeout) **spesifik mesaj + screenshot** ile durur. Kimlik bilgileri `.env.local`'dan; **hiçbir veri** Supabase/dosya/log'a yazılmaz (screenshot hariç). Yapı bilinçli olarak **tek-amaçlı, en sade hâlinde** — "adapter abstraction"u yok, multi-site genelleştirmesi yok; 003+'te abstraksiyon eklenecek.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict, `noUncheckedIndexedAccess`), Node 22

**Primary Dependencies**:
- `playwright` ^1.49 (dev — sadece scrape script çalıştırırken)
- `tsx` ^4 (dev — TypeScript script'ini doğrudan `tsx scripts/scrape/enderyapi.ts` ile çalıştırmak için)
- `dotenv` ^16 — `.env.local`'ı script'ten okumak için (Next.js bağlamı dışında)

**Storage**: **Hiçbiri.** Veri stdout'a yazılır, screenshot lokal `scrape-debug/` klasörüne (gitignored).

**Testing**: Otomatik test yok bu PoC için. Doğrulama manuel: gerçek hesapla çalıştırılır, çıktıya bakılır. CONSTITUTION "kritik path için test zorunlu" der; PoC'un asıl testi gerçek site karşısında çalışıp çalışmamasıdır — bunu otomatize etmek pratik değil (canlı site).

**Target Platform**:
- Geliştirici lokal makinesi (macOS / Linux / Windows) — Playwright Chromium üçünde de çalışır
- (V1'de değil, sonraki feature'da) GitHub Actions Linux runner

**Project Type**: CLI script (Next.js'in dışında, separate entry point)

**Performance Goals**:
- Happy path medyan **< 45sn**, p95 **< 60sn** (SC-002)
- Hata yolları **< 30sn** (SC-003, SC-004)
- Tek browser instance, sequential parse — concurrency yok

**Constraints**:
- Kimlik bilgileri **asla** log/screenshot/dosya adında geçmez (FR-002, FR-019)
- TR locale fiyat parse: `1.234,56 ₺` → `1234.56` number
- TR karakter encoding her yerde UTF-8
- Playwright Chromium binary indirme bir kez gerekir (~150 MB); CI'da cache'lenecek (005'te) — PoC'ta geliştirici lokalde bir kez `npx playwright install chromium` çalıştırır

**Scale/Scope**:
- 1 site (b2b.enderyapi.com.tr), tek hesap, ilk sayfa
- Beklenen: ~5-20 sipariş satırı (en az 1)
- Tek çağrı / komut, persist edilen state yok

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Gate | Kaynak | Durum | Not |
|---|------|--------|-------|-----|
| G1 | **Secrets in source code:** API key / secret kaynak kodda olmaz | CONSTITUTION → Güvenlik | ✅ PASS | `ENDERYAPI_USERNAME` / `ENDERYAPI_PASSWORD` `.env.local`'da; `.env.local` gitignored; FR-019 ile log'da da yok |
| G2 | **Service module pattern:** Veri çağrıları `lib/`'te toplanır | CONSTITUTION → Kod konvansiyonları | ⚠️ Sapma | Bu CLI script; `lib/` service module değil. Yapı `scripts/scrape/`'te. 004'te `lib/scraper/adapters/`'a refactor edilecek. Complexity Tracking'te belgelendi. |
| G3 | **Server Component default** | CONSTITUTION → Kod konvansiyonları | ⚠️ N/A | Next.js bileşeni değil; CLI |
| G4 | **Form validation zod** | CONSTITUTION → Kod konvansiyonları | ✅ PASS | Kullanıcı formu yok; ama env var validation zod schema ile yapılır (`scripts/scrape/credentials.ts`) |
| G5 | **RLS zorunlu:** Yeni tabloda RLS açık | CONSTITUTION → Backend | ✅ PASS (N/A) | Yeni tablo yok, DB write yok |
| G6 | **Türkçe i18n:** TR karakterler test edilmiş | CONSTITUTION → i18n | ✅ PASS | FR-020, SC-007 garanti — UTF-8 her yerde |
| G7 | **Tek kullanıcı kısıtı** | CONSTITUTION → Kısıtlar | ✅ PASS | Tek hesap, tek geliştirici çalıştırır |
| G8 | **Sıfır maliyet** | CONSTITUTION → Kısıtlar | ✅ PASS | Playwright open-source; Chromium binary ücretsiz; lokal makinede çalışır |
| G9 | **Anti-goal koruması** (V1: 2FA, sosyal, sign-up YOK — feature 001) | Spec 001 + 002 | ✅ PASS | 002 sadece okuma; auth feature'ına dokunmaz |
| G10 | **Naming convention** | CONSTITUTION → Kod standartları | ✅ PASS | `scripts/scrape/enderyapi.ts` (kebab-case), `OrderLine` type (PascalCase), `parseOrderRow()` (camelCase) |
| G11 | **No magic strings:** const'lar | CONSTITUTION → Kod standartları | ✅ PASS | Site URL'leri, selector'lar, hata mesaj'ları `scripts/scrape/constants.ts`'te toplanır |
| G12 | **Cookie / şifre güvenliği** | CONSTITUTION → Güvenlik | ✅ PASS | Playwright context tek-kullanım, persist edilmez; şifre stdout/dosya'da yok |
| **G13** | **Çoklu adapter mimarisi** (CONSTITUTION → Mimari kararlar 2026-05-15) | CONSTITUTION → Mimari kararlar | ⚠️ Bilinçli sapma | PoC olduğu için adapter interface YOK. 004'te `lib/scraper/adapters/`'a refactor edilecek. Complexity Tracking'te belgelendi. |
| G14 | **Şifre güvenliği:** B2B kullanıcı/şifresi nereye | CONSTITUTION → Mimari kararlar 2026-05-15 | ⚠️ Kısmi sapma | PoC'ta `.env.local`'da (lokal, gitignored). Constitution'da "GitHub Secrets'ta encrypted" diyor — o GitHub Actions için; lokal PoC'ta `.env.local` makul. 005'te GitHub Secrets'a taşınacak. Complexity Tracking'te belgelendi. |

**Sonuç:** Üç bilinçli sapma (G2, G13, G14) PoC'un doğasından kaynaklı, Complexity Tracking'te gerekçelendirildi. Diğer 11 gate ✅ PASS.

## Project Structure

### Documentation (this feature)

```text
specs/002-enderyapi-scraper-poc/
├── plan.md              # This file
├── spec.md              # Feature spec
├── research.md          # Phase 0 çıktısı
├── data-model.md        # Phase 1 — OrderLine entity (in-memory)
├── quickstart.md        # Phase 1 — manuel test akışı
├── contracts/
│   └── scrape-cli.md    # CLI contract (flags, exit codes, stdout/stderr format)
├── checklists/
│   └── requirements.md  # Spec kalite checklist'i (mevcut, 16/16 ✅)
└── tasks.md             # /speckit-tasks çıktısı
```

### Source Code (repository root)

```text
scripts/
└── scrape/
    ├── enderyapi.ts          # CLI entry point — main() + arg parsing + orchestration
    ├── constants.ts          # Site URL'leri, selector pattern'ları, hata mesajları
    ├── credentials.ts        # .env.local okuma + zod validation
    ├── output.ts             # Text vs JSON formatter
    ├── errors.ts             # Failure mode tanıma helper'ları (CAPTCHA, 2FA, vb.)
    ├── price-parse.ts        # TR locale fiyat parse: "1.234,56 ₺" → 1234.56
    └── README.md             # Çalıştırma talimatları (geliştirici için)

scrape-debug/                 # (gitignored) Hata anı screenshot'ları
└── <ISO-timestamp>.png

package.json                  # scripts.scrape:enderyapi eklenir + devDeps
.env.local                    # ENDERYAPI_USERNAME, ENDERYAPI_PASSWORD (gitignored)
.env.example                  # placeholder'lar eklenir
.gitignore                    # scrape-debug/ eklenir
```

**Structure Decision**: `scripts/scrape/` altında self-contained bir mini-modül. Next.js `app/` tree'sine, `lib/` paylaşımlı modüllere bağımlılık yok (G2 sapması). 004'te bu modül `lib/scraper/adapters/enderyapi.ts`'a taşınacak ve `lib/scraper/types.ts`'teki bir `SiteAdapter` interface'i implement edecek. Şimdilik standalone.

## Phase 0 — Research

Output: [research.md](./research.md)

Spec'te `[NEEDS CLARIFICATION]` yoktu ama PoC keşif odaklı — sınırı çizen birçok teknik karar var. Research.md'de 12 karar (R-001 → R-012) belgelendi: tool seçimi (Playwright vs alternatif), CLI arg parsing, env loading, failure detection pattern'ları, fiyat parse stratejisi, vb.

## Phase 1 — Design & Contracts

Outputs:
- [data-model.md](./data-model.md) — `OrderLine` (in-memory tipi, validation kuralları, parse helpers)
- [contracts/scrape-cli.md](./contracts/scrape-cli.md) — CLI yüzeyi: flags, exit codes, stdout/stderr formatları, hata mesajları
- [quickstart.md](./quickstart.md) — Manuel test akışı (lokal kurulum + happy path + 5 hata senaryosu)
- `CLAUDE.md` SPECKIT bloğu güncellenir

## Phase 2 — Tasks (sonraki komut)

`/speckit-tasks` `tasks.md`'yi üretecek.

## Complexity Tracking

> Constitution sapmaları burada belgelenir.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| **G2: Service module pattern dışı — kod `scripts/scrape/` altında, `lib/`'te değil** | PoC tek-amaçlı keşif script'i; `lib/` reusable modüllere koymak erken (YAGNI). Adapter interface 004'te yazılacak; bu script o zaman `lib/scraper/adapters/`'a refactor edilecek. | Şimdi `lib/`'e koysaydık: (a) hayali bir interface tasarlardık (gerçek site keşfi yokken), (b) tek implementasyonla generic kod premature abstraction. PoC sonuçları interface'in nasıl olması gerektiğini öğretecek. |
| **G13: Çoklu adapter mimarisi YOK** | Aynı PoC mantığı — site keşfini interface'siz yapıyoruz, sonra abstraksiyon türetiriz. CONSTITUTION'daki adapter hedefi 004'te. | Abstraksiyonu şimdi inşa etmek premature — site DOM'unu görmeden adapter shape'i belirleyemeyiz. |
| **G14: Şifre lokal `.env.local`'da, GitHub Secrets'ta değil** | PoC lokal makinede çalışır (cron, GitHub Actions yok). `.env.local` gitignored, makul güvenlik. 005'te GitHub Actions cron eklenince secret'lar GitHub Secrets'a taşınacak. | GitHub Secrets şimdi: GitHub Action olmadığı için anlamsız; ayrıca PoC sırasında geliştiricinin parmakla deneme yapması zorlaşır. |

## Post-design re-check

Phase 1 çıktıları sonrası Constitution Check tekrar değerlendirildi: hiçbir gate'te regresyon yok; üç bilinçli sapma (G2, G13, G14) yukarıda gerekçelendirildi ve 004-005 feature'larında düzelteceğimiz net. Constitution Check ✅ PASS (3 belgelenmiş sapma ile).
