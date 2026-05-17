# Implementation Plan: Otomatik scrape pipeline

**Branch**: `007-scrape-automation` | **Date**: 2026-05-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/007-scrape-automation/spec.md`

## Summary

Eker Ticaret çalışanı (son kullanıcı, sıfır teknik) dashboard üzerinden tedarikçi scrape'lerini yönetir: günlük saat ayarı + aç/kapa toggle + "Şimdi tetikle" butonu + son 10 koşum geçmişi. Manuel tetikleme **Server Action → GitHub `workflow_dispatch` API**; otomatik tetikleme **GitHub Actions cron (saatte 1) + DB'den hour eşleşme kontrolü** ile. B2B kimlik bilgileri + Supabase service role key **GitHub Repo Secrets**'a göç ettirilir (CONSTITUTION G15 kapanır).

## Technical Context

**Language/Version**: TypeScript 5.7 (strict mode) — frontend & scraper paylaşır

**Primary Dependencies**:
- Frontend: Next.js 15 (App Router) + React 19, Tailwind v4, react-hook-form + zod, @supabase/ssr
- Backend: Supabase (Postgres 15) — `scrape_schedule` yeni tablo + `scrape_runs.trigger_type` kolonu eklenir
- Otomasyon: GitHub Actions (ubuntu-latest), Playwright (Chromium), `tsx`
- HTTP: `fetch` API (Next.js native) — GitHub REST API `POST /repos/{owner}/{repo}/actions/workflows/{file}/dispatches`

**Storage**: Supabase Postgres (mevcut). Yeni tablo: `scrape_schedule` (1 satır/tedarikçi). Mevcut tablo değişikliği: `scrape_runs.trigger_type` ENUM (`auto | manual | unknown`).

**Testing**: Manuel quickstart-driven (settings sayfası, trigger button → workflow_dispatch → workflow log doğrulaması). Automated unit/integration testleri V1 kapsamı dışında (prototip akış, sıfır maliyet/zaman önceliği).

**Target Platform**:
- Web app: Vercel (edge + node runtime karışık; Server Action node runtime)
- Cron + scrape: GitHub Actions runner (ubuntu-latest, ~2 dk/koşum)

**Project Type**: web-fullstack (Next.js App Router + Supabase) + workflow file

**Performance Goals**:
- Manuel tetikleme UI yanıt süresi: < 5 sn (Server Action → GitHub API roundtrip + DB insert) [SC-003]
- Scrape tamamlanma: < 5 dk (mevcut performans, değişmez)
- Cron precision: ±1 saat (saatte bir tetikleme, DB hour-gating)

**Constraints**:
- Sıfır ek maliyet: GitHub Actions free tier (2000 dk/ay) günlük 1 + ~5 manuel tetikleme için yeterli (~30 dk/ay aktif compute)
- Tek concurrent run/tedarikçi: GitHub Actions `concurrency.group` + DB-side "running koşum var mı?" check
- Credentials zero-leak: tüm secret'lar GitHub Repo Secrets'ta; Vercel env'de yalnızca GitHub PAT (fine-grained, sadece `actions:write` scope, bu repo'ya scoped)

**Scale/Scope**: V1 — 1 tedarikçi (Enderyapı), 1 son kullanıcı, günlük 1 cron + opsiyonel manuel tetikleme. Maks ~50 koşum/ay. UI 1 yeni sayfa, 1 yeni server action, 1 yeni workflow file, 1 yeni DB tablosu, 1 mevcut tablo alterasyonu.

## Constitution Check

Constitution: [`.docs/CONSTITUTION.md`](../../.docs/CONSTITUTION.md)

| Gate | Karşılık | Durum |
|------|---------|-------|
| G1 — Kod standartları, TS strict, kebab-case | Yeni dosyalar konvansiyonu izler | ✓ Pass |
| G2 — Business logic UI'dan ayrı | Trigger logic: `app/actions/scrape-trigger.ts` (server action); query'ler `lib/queries/scrape-schedule.ts` | ✓ Pass |
| G3 — Secret'lar kodda olmaz | `GITHUB_PAT` → Vercel env (server-only); `SUPABASE_SERVICE_ROLE_KEY` + `ENDERYAPI_USERNAME/PASSWORD` → GitHub Repo Secrets | ✓ Pass |
| G4 — Auth middleware | Mevcut auth middleware settings sayfasını otomatik korur | ✓ Pass |
| G5 — Error handler | Server action try/catch + user-friendly mesaj; workflow log'larında ScrapeError tagging mevcut | ✓ Pass |
| G6 — Test (kritik path) | Manuel quickstart yeterli (V1 prototip); ileride E2E eklenebilir | ✓ Pass (V1 muafiyet) |
| G7/G8 — TR i18n, Türkçe karakter | Tüm UI metni TR; Zaman gösterimi `Intl.DateTimeFormat('tr-TR')` mevcut helper'larla | ✓ Pass |
| G14 — RLS zorunlu | `scrape_schedule` RLS: authenticated SELECT/UPDATE; INSERT/DELETE service-role-only (V1'de tek tedarikçi seed migration'da) | ✓ Pass |
| G15 — GitHub Secrets for B2B creds | Bu feature G15'i **kapatır**: `.env.local`'den GitHub Repo Secrets'a göç tasks.md'de açık adımlar | ✓ Pass — kapanır |
| G16 — Scrape ayarı DB'de + saatlik cron | `scrape_schedule` tablosu + `.github/workflows/scrape.yml` (cron `0 * * * *`) + hour-gating step | ✓ Pass |
| "Sıfır maliyet" | GitHub Actions free tier'da kalır (~30 dk/ay << 2000 dk kotası) | ✓ Pass |
| "Tek concurrent run" | `concurrency: scrape-${supplier}` + DB-side check | ✓ Pass |

**Violations**: 0. **Complexity Tracking** boş bırakıldı.

## Project Structure

### Documentation (this feature)

```text
specs/007-scrape-automation/
├── plan.md                                    # Bu dosya
├── research.md                                # Phase 0 — teknik karar gerekçeleri
├── data-model.md                              # Phase 1 — scrape_schedule + scrape_runs delta
├── quickstart.md                              # Phase 1 — manuel test akışı
├── contracts/
│   ├── scrape-schedule-table.md               # DB tablo kontratı (SQL şeması, RLS, CHECK'ler)
│   ├── scrape-trigger-server-action.md        # Server Action input/output sözleşmesi
│   ├── workflow-dispatch-api.md               # GitHub API ile entegrasyon (request/response shape)
│   └── scrape-yml-workflow.md                 # GitHub Actions workflow tanımı (triggers, steps, env)
└── checklists/
    └── requirements.md                        # /speckit-specify çıktısı
```

### Source Code (repository root)

Mevcut yapı korunur; bu feature'da eklenen/değişen dosyalar:

```text
app/
├── (app)/
│   └── dashboard/
│       └── settings/                          # YENİ
│           └── page.tsx                       # YENİ — Server Component (settings sayfası)
├── actions/                                   # YENİ klasör (yoksa)
│   ├── trigger-scrape.ts                      # YENİ — Server Action: workflow_dispatch çağrısı
│   └── save-schedule.ts                       # YENİ — Server Action: scrape_schedule UPSERT
└── api/                                       # (yeni endpoint yok — sadece server actions)

components/
├── features/
│   └── settings/                              # YENİ klasör
│       ├── supplier-schedule-card.tsx         # YENİ — Server Component (tedarikçi kart kompozisyonu)
│       ├── schedule-form.tsx                  # YENİ — Client (form + hour dropdown + toggle)
│       ├── trigger-now-button.tsx             # YENİ — Client (button + useTransition)
│       └── recent-runs-list.tsx               # YENİ — Server Component (son 10 koşum tablosu)
└── ui/
    └── top-bar.tsx                            # MOD — settings linki eklenir

lib/
├── queries/
│   └── scrape-schedule.ts                     # YENİ — listSchedules(), getNextRunFor(supplier)
├── github/                                    # YENİ klasör
│   └── workflow-dispatch.ts                   # YENİ — fetch wrapper: triggerWorkflow(supplier)
├── routes.ts                                  # MOD — SETTINGS route eklenir
└── validations/
    └── schedule-form.ts                       # YENİ — zod schema (hour 0-23, enabled boolean)

supabase/migrations/
├── 20260517_scrape_schedule_table.sql         # YENİ — tablo + RLS + 1 satır seed (Enderyapı)
└── 20260517_scrape_runs_trigger_type.sql      # YENİ — ALTER TABLE ... ADD COLUMN trigger_type

.github/
└── workflows/
    └── scrape.yml                             # YENİ — cron + workflow_dispatch + hour-gating

scripts/scrape/
└── run.ts                                     # MOD — `--trigger-type` flag eklenir (workflow'dan geçirilir, scrape_runs'a yazılır)
```

**Structure Decision**: Mevcut Next.js App Router yapısını koruyoruz. Yeni eklemeler ufak ve yerinde:
- UI: `app/(app)/dashboard/settings/page.tsx` (Server Component, mevcut pattern'a uyum)
- Server Actions: `app/actions/` (Next.js 15 önerisi — co-located actions yerine top-level klasör, top-bar'dan da kullanılabilir)
- DB: 2 migration (1 yeni tablo + 1 ALTER) — mevcut migration tarih-pattern'ine uyum
- Otomasyon: `.github/workflows/scrape.yml` (Constitution G16 referansı)

## Complexity Tracking

> Boş bırakıldı — Constitution Check'te ihlal yok.
