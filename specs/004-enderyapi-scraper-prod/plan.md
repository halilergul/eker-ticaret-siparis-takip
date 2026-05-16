# Implementation Plan: Enderyapi Gerçek Scraper — Adapter + Schema Yazma + Fiyat Snapshot

**Branch**: `004-enderyapi-scraper-prod` | **Date**: 2026-05-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-enderyapi-scraper-prod/spec.md`

## Summary

PoC kodu (`scripts/scrape/enderyapi.ts`) **adapter mimarisi**'ne refactor ediliyor (`lib/scraper/adapters/<site>.ts`). İlk concrete adapter: Enderyapi. CLI orchestrator (`scripts/scrape/run.ts`) `--supplier <slug>` argümanıyla bir adapter'ı seçer, login → sipariş listesi → her sipariş detay → katalog enrichment akışını koşar; sipariş başlık + satırlarını idempotent yazar (`ON CONFLICT DO NOTHING`); her ürün için 003'teki `record_price_observation` RPC'sini çağırır. Yeni tablo `scrape_runs` her koşumun izini tutar (başlangıç/bitiş, status, summary JSON, error message).

DB yazımı `service_role` (RLS bypass) ile yapılır; `SUPABASE_SERVICE_ROLE_KEY` `.env.local`'dan okunur. Her sipariş kendi transaction'ında işlenir (Postgres function veya tek RPC'de). Login + B2B kimlik bilgileri hiçbir log/dosya/tabloya yazılmaz (FR-008, SC-006).

Katalog 3. seviye DOM henüz keşfedilmedi — implementation sırasında 1-2 selector iterasyonu beklenir (002 pattern'ı: aday array + verbose log + headed mode). En kötü senaryoda P2 (katalog enrichment) 005'e ertelenir, P1 + P3 ile feature closure.

## Technical Context

**Language/Version**: TypeScript 5.x (mevcut); Node.js 20+ (tsx runner), Playwright 1.60.x (mevcut PoC).

**Primary Dependencies**: `playwright` (Chromium), `@supabase/supabase-js` (server-side createClient), `dotenv` (env load), `zod` (env + summary validation). Yeni dep YOK.

**Storage**: Supabase Postgres (003 schema). Bu feature 1 yeni tablo (`scrape_runs`) ekler; mevcut 5 tabloya yazar.

**Testing**: Manuel CLI testleri (quickstart.md). Unit test opsiyonel — adapter helper'ları (price-parse, detection) PoC'tan korunur, zaten test edilmiş davranış.

**Target Platform**: Geliştirici makinesi (macOS/Linux) lokal koşum + 005'te GitHub Actions runner. Vercel'e gitmez (Chromium büyük).

**Project Type**: Web application — bu feature CLI/Node modülü ekler; Next.js runtime'a dokunmaz.

**Performance Goals**: 20 sipariş + 60 ürün satırı + 30 unique ürün için tam scrape <5 dakika (FR-013 global timeout). Bireysel sipariş detay <10 sn, katalog ziyaret <5 sn.

**Constraints**: Free tier (Supabase + lokal makine). Tek paralel koşum (V1 koruma yok ama idempotency veri bozulmasını engeller). Memory <1 GB (Playwright Chromium tipik). `scrape-debug/` gitignored.

**Scale/Scope**: ~6 yeni TypeScript dosya (`lib/scraper/{adapters/enderyapi.ts, types.ts, supabase-writer.ts, run-logger.ts, adapter-registry.ts}`, `scripts/scrape/run.ts`), ~1 yeni migration (`scrape_runs` + RLS + GRANT), ~2 modifikasyon (PoC `enderyapi.ts` adapter'a refactor + deprecation). ~600 satır kod toplam.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Gate | Kaynak | Durum | Not |
|---|------|--------|-------|-----|
| G1 | **Secrets in source code** | CONSTITUTION → Güvenlik | ✅ PASS | `ENDERYAPI_*`, `SUPABASE_SERVICE_ROLE_KEY` `.env.local`; gitignored; FR-008 + SC-006 ile log/screenshot'a sızma kontrolü. |
| G2 | **Service module pattern** | CONSTITUTION → Kod konvansiyonları | ✅ PASS | `lib/scraper/adapters/`, `lib/scraper/supabase-writer.ts` — service modülleri net ayrılır. 002 sapması bu feature'da düzeltiliyor. |
| G3 | **Server Component default** | CONSTITUTION → Kod konvansiyonları | ✅ PASS (N/A) | UI yok. |
| G4 | **Form validation zod** | CONSTITUTION → Kod konvansiyonları | ✅ PASS | Form yok ama CLI argv + env + scrape summary JSON zod ile valide edilir. |
| G5 | **RLS zorunlu** | CONSTITUTION → Backend | ✅ PASS | Yeni `scrape_runs` tablosu RLS aktif + 4 policy + GRANT (003 pattern). |
| G6 | **Türkçe i18n** | CONSTITUTION → i18n | ✅ PASS | CLI stdout TR; `status` text TR ("Onaylandı"), `summary.errors` UTF-8. |
| G7 | **Tek kullanıcı kısıtı** | CONSTITUTION → Kısıtlar | ✅ PASS | Tek kullanıcı, tek geliştirici çalıştırır. `scrape_runs` per-row ownership yok (003 pattern). |
| G8 | **Sıfır maliyet** | CONSTITUTION → Kısıtlar | ✅ PASS | Lokal koşum; Supabase free; Chromium open-source. |
| G9 | **Anti-goal koruması** | CONSTITUTION → Anti-goal | ✅ PASS | Stok/satış/POS YOK. Sadece veri okuma + fiyat takibi. |
| G10 | **Naming convention** | CONSTITUTION → Kod standartları | ✅ PASS | `enderyapi.ts` (kebab), `EnderyapiAdapter` (Pascal), `runScrape()` (camel). |
| G11 | **No magic strings** | CONSTITUTION → Kod standartları | ✅ PASS | URL'ler, selector aday array'leri `adapters/enderyapi.ts` içinde const; PoC'tan korunur. |
| G12 | **Service role secret never client-side** | CONSTITUTION → Güvenlik | ✅ PASS | Scraper Node.js process; client (browser) kodu bu key'i hiç görmez. |
| G13 | **Çoklu adapter mimarisi** | CONSTITUTION → Mimari kararlar | ✅ PASS | Feature'ın çekirdek değeri budur. `Adapter` interface tanımlanır; Enderyapi ilk implementation. 002 sapması bu feature'da düzeltiliyor. |
| G14 | **Migration file-versioning** | CONSTITUTION → Stack | ✅ PASS | `scrape_runs` migration `supabase/migrations/<ts>_scrape_runs.sql` + MCP `apply_migration`. |
| G15 | **B2B credentials in GitHub Secrets (deploy)** | CONSTITUTION → Mimari 2026-05-15 | ⚠️ Kısmi sapma (bilinçli) | V1'de lokal çalıştırma, `.env.local`. GitHub Secrets'a taşıma 005 kapsamı. Complexity Tracking'te belgelendi. |

**Sonuç**: 14/15 ✅ PASS, 1 ⚠️ bilinçli sapma (G15 — 005'te düzelir). 002'deki G2 + G13 düzeltildi.

## Project Structure

### Documentation (this feature)

```text
specs/004-enderyapi-scraper-prod/
├── plan.md                      # This file
├── spec.md                      # Feature spec
├── research.md                  # Phase 0 — 15 karar
├── data-model.md                # Phase 1 — scrape_runs entity + Adapter TS interface
├── contracts/
│   ├── adapter-interface.md     # TS interface kontratı
│   ├── cli-contract.md          # `npm run scrape` argv + exit codes
│   └── scrape-runs-sql.md       # scrape_runs migration kontratı
├── quickstart.md                # Phase 1 — manuel doğrulama
├── checklists/
│   └── requirements.md          # Spec quality checklist
└── tasks.md                     # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
lib/
└── scraper/
    ├── types.ts                       # Adapter interface, ScrapeSummary, ScrapeContext
    ├── supabase-writer.ts             # writeOrderHeader(), writeOrderItems(), recordPriceObservation()
    ├── run-logger.ts                  # scrape_runs CRUD: start(), succeed(), partial(), fail(), abort()
    ├── adapter-registry.ts            # slug → adapter mapping (statik)
    └── adapters/
        └── enderyapi.ts               # EnderyapiAdapter — login, listOrders, getOrderDetail, getProductPrice

scripts/
└── scrape/
    ├── run.ts                          # YENİ: CLI orchestrator
    ├── enderyapi.ts                    # MEVCUT (002) — deprecation notu eklenir, geri uyumluluk için bir süre durur
    ├── constants.ts                    # MEVCUT — Enderyapi-spesifik kısımları adapter'a taşınır
    ├── credentials.ts                  # MEVCUT — multi-supplier credential loader'a evrilir (slug → env var pattern)
    ├── price-parse.ts                  # MEVCUT — korunur
    ├── output.ts                       # MEVCUT — silinmez ama artık kullanılmaz (JSON çıktı için)
    ├── errors.ts                       # MEVCUT — yeni FailureMode'lar eklenir
    ├── detection.ts                    # MEVCUT — korunur
    └── README.md                       # GÜNCELLENİR

supabase/
└── migrations/
    └── 20260516______01_scrape_runs.sql   # YENİ — tablo + RLS + GRANT

package.json
└── scripts:
      "scrape": "tsx scripts/scrape/run.ts"
      "scrape:enderyapi": "tsx scripts/scrape/enderyapi.ts"   # KORUNUR (geri uyumluluk, deprecation)
```

**Structure Decision**: PoC kodu **çekirdek dosyalar korunarak** adapter pattern'a evrildiriliyor:
- **Helper'lar** (`price-parse`, `detection`, `errors`) yerinde kalır.
- **Credential loader** generic'leşir: `loadCredentials(slug)` → `process.env.<SLUG_UPPER>_USERNAME/PASSWORD` pattern'ına bakar.
- **Adapter'a-özel mantık** Enderyapi için `lib/scraper/adapters/enderyapi.ts`'e taşınır.
- **Orchestrator** (`scripts/scrape/run.ts`) generic; registry üzerinden adapter seçer.
- **DB writer** (`lib/scraper/supabase-writer.ts`) — service_role client'ı tek yerde; adapter'lar DB'yi bilmez (saf veri çıkarır).

Mevcut `scripts/scrape/enderyapi.ts` CLI standalone'u **deprecation notu** ile durur (geri uyumluluk + örnek değer). 005+ feature'da silinir.

## Complexity Tracking

> G15 sapması bilinçli; tablo doldurulur.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| G15 — Credentials GitHub Secrets'ta değil, `.env.local`'da | Bu feature lokal koşum hedefler; otomasyon 005 scope | GitHub Secrets'a şimdi taşımak: 005'siz Actions workflow YOK; secret'lar yalnızca CI'da gerekli. Şimdi taşımak premature. |
