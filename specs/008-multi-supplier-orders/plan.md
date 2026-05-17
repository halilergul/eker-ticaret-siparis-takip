# Implementation Plan: İkizler + Levent Şimşek tedarikçileri (sipariş scrape)

**Branch**: `008-multi-supplier-orders` | **Date**: 2026-05-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/008-multi-supplier-orders/spec.md`

## Summary

İki yeni B2B tedarikçi adapter modülü yazılır (`lib/scraper/adapters/ikizler.ts`, `leventsimsek.ts`). Mevcut adapter interface (login + listOrders + getOrderDetail) hiç değişmeden uygulanır; catalog metodu bu feature kapsamında implemente edilmez (009'a ertelendi). DB şemasına dokunulmaz — sadece `suppliers` ve `scrape_schedule` tablolarına 2'şer seed satırı eklenir. UI tarafında settings sayfası ve siparişler filtresi mevcut tedarikçi-bazlı DB sorguları sayesinde **otomatik** olarak yeni tedarikçileri gösterir. Tek kod değişikliği gereken UI noktası: GitHub Actions workflow_dispatch `supplier` input'unun `choice options` listesinin genişletilmesi (Server Action ile tetikleme için zorunlu).

Teknik yaklaşım: her site için iteratif DOM keşfi (Playwright `--headed` ile selector tespit + dump → adapter implementasyonu → quickstart smoke test → GitHub Secrets üzerinden prod doğrulama). 006'da Unicode apostrof-tabanlı text arama enderyapi'de kırıldığı için her iki adapter'da da **CSS class/id-tabanlı selector'lar** tercih edilir; text-tabanlı eşleştirme yalnızca son çare fallback olarak kullanılır.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), Node.js 22, React 19, Next.js 15 (App Router)

**Primary Dependencies**: Playwright (Chromium, GitHub Actions runner üzerinde), `@supabase/ssr`, `@supabase/supabase-js`, `dotenv`, `zod` (yeni paket eklenmez)

**Storage**: PostgreSQL (Supabase managed). Tablolar mevcut: `suppliers`, `scrape_schedule`, `supplier_orders`, `order_items`, `products`, `scrape_runs`. **Yeni tablo yok**; iki seed migration.

**Testing**: Manuel quickstart smoke test (`npm run scrape:all -- --supplier <slug> --skip-catalog`); birim/entegrasyon test V1 kapsamında değil (enderyapi precedent — quickstart yeterli). Selector regresyonları manuel `scrape-debug/*.png` ile yakalanır.

**Target Platform**: Vercel Hobby (Next.js frontend + Server Actions) + GitHub Actions `ubuntu-latest` runner (Playwright scrape). İki yeni tedarikçi `scrape-${supplier}` concurrency group sayesinde paralel runner instance'ında izole çalışır.

**Project Type**: Web fullstack (Next.js App Router monorepo, Constitution stack ile hizalı).

**Performance Goals**:
- Her tedarikçi için tek scrape (sipariş aşaması) **≤ 10 dakika** (workflow `timeout-minutes: 15`; orchestrator iç sınır `TIMEOUT_OVERRIDE_MS=480000` = 8 dk).
- İlk scrape: 30–80 sipariş × 5–25 satır beklentisi (Enderyapı: 12 sipariş / 36 ürün referans).
- İkinci ve sonraki scrape'lerde idempotency sayesinde DB INSERT 0 yakın (SC-004).

**Constraints**:
- **Sıfır maliyet** — Vercel Hobby + GitHub Actions free tier (2000 dk/ay). 3 tedarikçi × günlük 1 tetik ≈ 30–60 dk/ay, sınırın %3'ü.
- **Tek kullanıcı** — Yeni RLS politikası yazılmaz; mevcut `authenticated` policy'leri yeterli.
- **Kaynak kodda kimlik bilgisi yok** — `IKIZLER_*` ve `LEVENTSIMSEK_*` env değerleri yalnızca `.env.local` (dev) ve GitHub Repo Secrets (prod).
- **İkizler HTTP** — credential plaintext riski Eker Ticaret tarafından kabul edildi (Constitution güncellenecek); mitigation yok.
- **CORS** — tarayıcıdan direkt B2B fetch yok; tüm scraping server-side Playwright.

**Scale/Scope**:
- 2 yeni adapter dosyası (~300–500 satır/adapter, enderyapi 30K karaktere yakın — daha kısa beklenir çünkü catalog yok).
- 2 yeni migration (seed: `suppliers` + `scrape_schedule`).
- 1 workflow YAML güncelleme (`supplier choice options` listesini genişlet).
- 1 adapter-registry güncelleme (2 import + 2 satır map'e ekleme).
- 0 yeni UI bileşeni — settings sayfası ve filtre dropdown'u DB-driven.

## Constitution Check

*GATE: Pass before Phase 0; re-check after Phase 1.*

| Gate | Status | Notes |
|------|--------|-------|
| **Sıfır maliyet** | ✅ PASS | 2000 dk/ay free tier'da rahat sığar; yeni servis veya paid plan yok. |
| **Tek kullanıcı / RLS** | ✅ PASS | Yeni tablo yok → yeni RLS yok. Mevcut `authenticated_*` policy'leri yeterli. |
| **Secrets disiplini** | ✅ PASS | 4 yeni GitHub Repo Secret (`IKIZLER_USERNAME/PASSWORD`, `LEVENTSIMSEK_USERNAME/PASSWORD`); kaynak koda commit edilmez. `.env.local` dev için; `.env.example`'a placeholder eklenir. |
| **Adapter mimari** | ✅ PASS | Her site için ayrı `lib/scraper/adapters/<slug>.ts` modülü — Constitution 2026-05-15 kararı doğrudan uygulanır. UI değişmez. |
| **Türkçe karakter / i18n** | ✅ PASS | Düz CSS selector + DB text alanları — Postgres UTF-8 default; ürün adı, durum metni Türkçe karakterlerle saklanır. Apostrof riski için **CSS class-tabanlı arama zorunlu**. |
| **Site DOM kırılma noktası** | ⚠ ACCEPT | Selector kırılırsa run "Başarısız" + `selector-not-found` mode — manuel adapter güncellemesi gerekecek (gelecek minor feature). Mevcut Constitution maddesi bu riski açık kabul ediyor. |
| **HTTP plaintext riski (İkizler)** | ⚠ ACCEPT | Kullanıcı tarafından açıkça kabul edildi; FR-012'de işaretli. Mitigation yok. Constitution'a "Mimari kararlar" tablosunda 2026-05-17 satırı eklenir. |
| **G15 (Secrets göçü, 007)** | ✅ PASS | Yeni 4 secret GitHub Repo Secrets'a doğrudan eklenir; geçiş dönemi yok. |
| **G16 (per-supplier scrape_schedule, 007)** | ✅ PASS | Mevcut tablo şeması yeterli; sadece 2 yeni satır seed. |
| **Adapter interface uyumu** | ✅ PASS | Yeni adapter'lar `scrapeCatalog`'u **implemente etmez** (optional metod, 009'da eklenecek). `getProductPrice` zorunlu ama legacy — minimal `return null` veya `throw 'not-implemented'` kabul (enderyapi precedent ile uyumlu). |

**Tüm gate'ler PASS veya yazılı ACCEPT** — Phase 0 araştırmasına geçilebilir. Yeni Complexity Tracking gerekli değil.

## Project Structure

### Documentation (this feature)

```text
specs/008-multi-supplier-orders/
├── plan.md              # Bu dosya
├── spec.md              # /speckit-specify çıktısı (var)
├── research.md          # Phase 0 çıktısı
├── data-model.md        # Phase 1 çıktısı (seed-only)
├── quickstart.md        # Phase 1 çıktısı
├── contracts/
│   ├── adapter-contract.md     # Yeni adapter'ların uyacağı kontrat
│   ├── ikizler-discovery.md    # İkizler DOM keşif rehberi
│   └── leventsimsek-discovery.md  # Levent Şimşek DOM keşif rehberi
├── checklists/
│   └── requirements.md         # /speckit-specify çıktısı (var)
└── tasks.md             # /speckit-tasks çıktısı (sonraki adım)
```

### Source Code (repository root)

```text
lib/
├── scraper/
│   ├── adapter-registry.ts             # GÜNCELLENİR: 2 import + map'e 2 satır
│   ├── adapters/
│   │   ├── enderyapi.ts                # değişmez (referans)
│   │   ├── ikizler.ts                  # YENİ — ASP.NET MVC, bayi.ikizlerhirdavat.com
│   │   ├── ikizler.constants.ts        # YENİ — site-specific URLs/selectors
│   │   ├── leventsimsek.ts             # YENİ — PHP, liste.leventsimsekarmatur.com
│   │   └── leventsimsek.constants.ts   # YENİ — site-specific URLs/selectors
│   ├── types.ts                        # değişmez
│   ├── run-logger.ts                   # değişmez
│   ├── supabase-writer.ts              # değişmez
│   └── errors.ts                       # değişmez

scripts/
└── scrape/
    ├── all.ts                          # değişmez (adapter-agnostic)
    ├── credentials.ts                  # değişmez (slug-driven env lookup zaten var)
    ├── constants.ts                    # DEPRECATED yorumu — enderyapi-spesifik kalır
    └── ...                             # diğer dosyalar değişmez

supabase/
└── migrations/
    ├── 2026XXXX_seed_ikizler_leventsimsek.sql      # YENİ
    └── 2026XXXX_seed_schedule_ikizler_leventsimsek.sql  # YENİ

.github/
└── workflows/
    └── scrape.yml                      # GÜNCELLENİR: supplier choice options listesi

.env.example                            # GÜNCELLENİR: 4 yeni placeholder
```

**Structure Decision**: Web fullstack (Next.js App Router monorepo). Yeni kod tamamen `lib/scraper/adapters/` altında — UI ve query katmanı dokunulmaz. Constants ayrı dosyada (`<slug>.constants.ts`) çünkü mevcut `scripts/scrape/constants.ts` enderyapi'ye gömülü ve genişletmek namespace çatışması yaratıyor (her sitenin ayrı `SITE_BASE_URL`, `LOGIN_PATHS` vb. olması lazım). Per-adapter constants dosyası adapter ile yan yana → keşif sırasında tek dosyada git diff takip kolaylığı.

## Phase 0 — Research

Tüm bilinmeyenler, alternatifler ve kararlar `research.md`'de toplandı:

1. **İkizler DOM keşif stratejisi** — ASP.NET MVC pattern, login form `__RequestVerificationToken` muhtemeldir; iteratif `--headed` + `scrape-debug/*.png` dump.
2. **Levent Şimşek DOM keşif stratejisi** — PHP/index.php, klasik form POST muhtemeldir; aynı iteratif yöntem.
3. **Per-supplier constants organizasyonu** — `lib/scraper/adapters/<slug>.constants.ts` (yan yana dosya pattern'i).
4. **Credentials env var naming** — `IKIZLER_USERNAME/PASSWORD`, `LEVENTSIMSEK_USERNAME/PASSWORD` (slug uppercase, `-` → `_`).
5. **Workflow_dispatch supplier input** — `choice options: [enderyapi, ikizler, leventsimsek]`.
6. **getProductPrice legacy metod stratejisi** — Adapter interface'inde zorunlu görünüyor; yeni adapter'lar `throw not-implemented` veya `return null` döndürür (catalog 009'a ertelendi).
7. **HTTP risk için ek mitigation** — Kullanıcı tarafından kabul edildi; sıfır aksiyon.
8. **2FA/captcha tespiti** — Mevcut `detection.ts` modülü adapter-agnostic; her iki adapter login sonrası `detectCaptcha`/`detect2FA` çağırır.

## Phase 1 — Design & Contracts

### Data Model (`data-model.md`)

**Yeni tablo, RLS, RPC YOK.** Yalnızca iki seed migration:

1. `suppliers` tablosuna 2 satır: `(ikizler, "İkizler Hırdavat", http://bayi.ikizlerhirdavat.com)`, `(leventsimsek, "Levent Şimşek Armatür", https://liste.leventsimsekarmatur.com)`.
2. `scrape_schedule` tablosuna 2 satır: her supplier için `enabled=false, daily_hour_utc=9` (Enderyapı'ya uygulanan default ile aynı).

Detaylar `data-model.md`'de.

### Contracts (`contracts/`)

Proje **adapter-driven**, public API'si yok (tek kullanıcı, internal dashboard). Tek "kontrat" — her yeni adapter'ın uyacağı **Adapter interface**'i (`lib/scraper/types.ts`). Bu feature için contracts klasörü 3 dosya içerir:

- **`adapter-contract.md`** — Yeni adapter'ın 4 metodu (login, listOrders, getOrderDetail, getProductPrice) için input/output, failure mode taxonomy, idempotency garantileri, ihlal örnekleri.
- **`ikizler-discovery.md`** — İkizler-spesifik DOM keşif checklist (login form alanları, sipariş listesi seçici adayları, detay sayfası URL pattern'i, screenshot referansı).
- **`leventsimsek-discovery.md`** — Levent Şimşek-spesifik aynı checklist.

Bu kontrat dökümanları implementer için "selector keşfi sırasında hangi sırayla deneyeceği" rehberidir; yapısal değil davranışsal sözleşmedir.

### Quickstart (`quickstart.md`)

Yerel + production smoke test akışı:

1. **Local seed**: `mcp__supabase__apply_migration` ile 2 seed migration uygulanır.
2. **Local credentials**: `.env.local`'a 4 yeni env değişkeni eklenir (kullanıcının kendisi).
3. **Local DOM keşif**: `npm run scrape:all -- --supplier ikizler --skip-catalog --headed --verbose` — Playwright görsel modda; selector tespit + ayar.
4. **Local idempotency**: aynı komut 2 kez → ikinci koşum `orders_inserted=0`.
5. **GitHub Secrets göçü**: 4 secret repo settings'ten eklenir.
6. **Workflow_dispatch test**: settings sayfasında "İkizler" kartı → "Şimdi tetikle" → 5 dk içinde "Son koşumlar"da satır.
7. **Levent Şimşek için aynı akış paralel**.

### Agent Context Update

`CLAUDE.md` içindeki `<!-- SPECKIT START --> ... <!-- SPECKIT END -->` blokunda **Aktif feature** alanı `008-multi-supplier-orders` olarak güncellenir; plan referansı: `specs/008-multi-supplier-orders/plan.md`.

## Constitution Re-check (post-design)

Phase 1 design sonrası değişiklik yok:

- Yeni paket eklenmedi → free tier güvenli.
- Yeni RLS/tablo yok → güvenlik yüzeyi genişlemedi.
- Adapter pattern korundu → mevcut karar uygulandı.
- HTTP riski açıkça documented; Constitution mimari kararlar tablosuna yeni satır eklenecek.

**Phase 0 + Phase 1 PASS**. Sonraki adım: `/speckit-tasks` ile task breakdown.

## Complexity Tracking

> Tüm gate'ler PASS — bu bölüm boş.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
