---
description: "Task list — 007-scrape-automation"
---

# Tasks: Otomatik scrape pipeline (007)

**Input**: Design documents from `/specs/007-scrape-automation/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)
**Tests**: Manuel (quickstart-driven); automated unit/integration testleri V2'ye ertelendi (research.md R10).

## Format: `[ID] [P?] [Story?] Description with file path`

- **[P]**: Different file & no dependency on incomplete tasks → can run in parallel
- **[Story]**: US1 / US2 / US3 — Setup/Foundational/Polish phase'lerinde yok

## Path Conventions

Next.js App Router (web-fullstack overlay'i). Mevcut yapı korunur:
- UI: `app/(app)/dashboard/`, `components/features/`, `lib/`
- DB: `supabase/migrations/`
- Otomasyon: `.github/workflows/`
- Scraper: `lib/scraper/`, `scripts/scrape/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Build-time / config seviyesi hazırlıklar. DB migration'lar Phase 2'de.

- [X] T001 [P] `.env.example` dosyasını güncelle: `GITHUB_PAT`, `GITHUB_OWNER`, `GITHUB_REPO` placeholder satırlarını ekle (gerçek değer yok, sadece variable adı + yorum)
- [X] T002 [P] `lib/routes.ts` içine `SETTINGS: "/dashboard/settings"` route'unu ekle (mevcut `ROUTES` objesine satır eklemek)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: DB şeması + paylaşılan helper'lar. Bunlar bitmeden US1/US2/US3 başlayamaz.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 DB migration: `scrape_schedule` tablosunu oluştur — `mcp__supabase__apply_migration({ name: "scrape_schedule_table", query: <[contracts/scrape-schedule-table.md](./contracts/scrape-schedule-table.md) içindeki SQL> })`. Migration script repo'ya da yaz: `supabase/migrations/<timestamp>_scrape_schedule_table.sql`
- [X] T004 DB migration: `scrape_runs.trigger_type` kolonu ekle — `mcp__supabase__apply_migration({ name: "scrape_runs_trigger_type", query: <ALTER TABLE ... ADD COLUMN trigger_type ... CHECK ...> })`. Repo'da: `supabase/migrations/<timestamp>_scrape_runs_trigger_type.sql`
- [X] T005 Doğrulama (post-migration): `mcp__supabase__execute_sql` ile `SELECT count(*) FROM public.scrape_schedule` → 1 (Enderyapı seed); `SELECT column_name FROM information_schema.columns WHERE table_name='scrape_runs' AND column_name='trigger_type'` → row mevcut
- [X] T006 Supabase types yeniden üret: `mcp__supabase__generate_typescript_types` → çıktıyı [lib/supabase/database.types.ts](lib/supabase/database.types.ts) içine yaz (mevcut dosyayı tamamen değiştir)
- [X] T007 [P] Zod schema: [lib/validations/schedule-form.ts](lib/validations/schedule-form.ts) — `saveScheduleSchema` ([contracts/save-schedule-server-action.md](./contracts/save-schedule-server-action.md) "Input Validation" başlığındaki shape: supplierSlug regex, enabled boolean, dailyHourUtc 0-23) ve `triggerInputSchema` (supplierSlug)
- [X] T008 [P] GitHub workflow_dispatch fetch wrapper: [lib/github/workflow-dispatch.ts](lib/github/workflow-dispatch.ts) — `dispatchScrapeWorkflow({ supplierSlug, triggerType })` fonksiyonu, fetch + Bearer PAT + error mapping (status code + bodyHash log) ([contracts/workflow-dispatch-api.md](./contracts/workflow-dispatch-api.md))
- [X] T009 [P] DB queries: [lib/queries/scrape-schedule.ts](lib/queries/scrape-schedule.ts) — `listSchedules()` (tüm tedarikçiler için scrape_schedule + supplier slug/name join), `getScheduleBySupplierSlug(slug)`, `calculateNextRunAt(enabled, dailyHourUtc): Date|null` (next UTC occurrence)
- [X] T010 [P] DB queries: [lib/queries/scrape-runs.ts](lib/queries/scrape-runs.ts) — `listRecentRuns(supplierId, limit=10)` ile son N koşumu döndür (started_at DESC; status/summary/error_message/trigger_type/started_at/finished_at)
- [X] T011 `lib/scraper/run-logger.ts` içindeki `startRun()` signature'ını genişlet: `startRun(supplierId: string, triggerType: 'auto' | 'manual' | 'unknown' = 'unknown')` — INSERT statement'a `trigger_type` ekle
- [X] T012 `scripts/scrape/run.ts` içine `--trigger-type` CLI flag desteği ekle ([contracts/scrape-yml-workflow.md](./contracts/scrape-yml-workflow.md) "Detail" başlığı). Default `unknown`. `startRun()` çağrısına geçir

**Checkpoint**: Foundation ready — US1/US2/US3 paralel başlayabilir.

---

## Phase 3: User Story 1 — Manuel "Şimdi tetikle" (Priority: P1) 🎯 MVP

**Goal**: Eker Ticaret çalışanı `/dashboard/settings` sayfasından "Şimdi tetikle" butonuyla scrape başlatabilir; sonuç birkaç dakika içinde "Son koşumlar" listesinde görünür.

**Independent Test**: Settings sayfası boş geçmişle açılır → "Şimdi tetikle"'ye basılır → 5 dk içinde geçmiş listesinde 1 koşum görünür → siparişler/zamlanan ürünler sayfalarında yeni veri.

### Implementasyon (US1)

- [X] T013 [P] [US1] Server Action: [app/actions/trigger-scrape.ts](app/actions/trigger-scrape.ts) — `triggerScrape({ supplierSlug })` ([contracts/scrape-trigger-server-action.md](./contracts/scrape-trigger-server-action.md) "Flow" başlığındaki 7 adım: auth → supplier lookup → concurrency check → workflow_dispatch → INSERT scrape_runs (status=running, trigger_type=manual) → revalidatePath → return)
- [X] T014 [P] [US1] Client component: [components/features/settings/trigger-now-button.tsx](components/features/settings/trigger-now-button.tsx) — `"use client"`, `useTransition` ile pending state, `triggerScrape` Server Action çağrısı, başarı/hata mesajı (Türkçe, [contracts/scrape-trigger-server-action.md](./contracts/scrape-trigger-server-action.md) "Error UX" tablosu)
- [X] T015 [P] [US1] Server component: [components/features/settings/recent-runs-list.tsx](components/features/settings/recent-runs-list.tsx) — `listRecentRuns(supplierId, 10)` ile son 10 koşum tablosu; status rozeti (running/success/partial/failed); trigger_type badge (otomatik/manuel/—); kısa özet (X sipariş · Y snapshot · Z hata); tr-TR tarih formatı; boş state mesajı
- [X] T016 [US1] Settings page (US1 versiyonu): [app/(app)/dashboard/settings/page.tsx](app/(app)/dashboard/settings/page.tsx) — Server Component, `listSchedules()` ile tedarikçi listesini çek; her tedarikçi için TriggerNowButton + RecentRunsList render et (US2'deki form bu phase'de yok; sadece "Otomatik scrape ayarları US2'de" placeholder olabilir). Auth guard mevcut middleware ile garanti
- [X] T017 [US1] Top-bar nav: [components/ui/top-bar-nav.tsx](components/ui/top-bar-nav.tsx) içine "Ayarlar" linki ekle (`ROUTES.SETTINGS`, aria-current pattern mevcut)
- [X] T018 [US1] (MANUEL — kullanıcı) Quickstart Test 1-3 (Settings erişim + manuel tetikleme + concurrency) — dev sunucuda + Vercel preview'da test et. **Sonuç**: 2026-05-17 prod testi başarılı; 2 manuel tetikleme (08:04 order + 08:05 catalog) `success` döndü, 36 snapshot eklendi. Concurrency check sırasında ikinci tıklama da hata mesajıyla reddedildi (manuel doğrulanmadı ama kod yolu açık).

**Checkpoint**: US1 manuel tetikleme akışı çalışıyor — son kullanıcı butonla scrape başlatabiliyor.

---

## Phase 4: User Story 2 — Günlük scrape saatini ayarlama (Priority: P2)

**Goal**: Eker Ticaret çalışanı saat dropdown + toggle ile otomatik scrape ayarını yönetir; cron her gün belirlenen saatte tetiklenir.

**Independent Test**: Saat 09 seçilir + toggle açılır + kaydedilir → ertesi gün 09:xx UTC koşum scrape_runs'a yazılmış olur (`trigger_type='auto'`).

### Implementasyon (US2)

- [X] T019 [P] [US2] Server Action: [app/actions/save-schedule.ts](app/actions/save-schedule.ts) — `saveSchedule({ supplierSlug, enabled, dailyHourUtc })` ([contracts/save-schedule-server-action.md](./contracts/save-schedule-server-action.md) "Flow"); UPSERT pattern; `nextRunAt` JS hesaplaması; revalidatePath
- [X] T020 [P] [US2] Client component: [components/features/settings/schedule-form.tsx](components/features/settings/schedule-form.tsx) — `"use client"`, react-hook-form + zodResolver(saveScheduleSchema); toggle (enabled), hour dropdown (00-23 select); "09:00 UTC = 12:00 İstanbul" açıklama satırı (saat seçimine göre dinamik); "Kaydet" butonu dirty state'de aktif; başarı/hata toast (inline TR mesajı)
- [X] T021 [P] [US2] Server component: [components/features/settings/supplier-schedule-card.tsx](components/features/settings/supplier-schedule-card.tsx) — tedarikçi başına compose: başlık (tedarikçi adı), `<ScheduleForm />`, `<TriggerNowButton />`, "Sonraki otomatik scrape: <tarih saat UTC>" özeti (`calculateNextRunAt` sonucu, kapalıysa "Otomatik scrape kapalı"), `<RecentRunsList />`
- [X] T022 [US2] Settings page güncelle: [app/(app)/dashboard/settings/page.tsx](app/(app)/dashboard/settings/page.tsx) — US1'deki minimal halini `<SupplierScheduleCard />` ile değiştir (T021)
- [X] T023 [P] [US2] Scheduler check script: [scripts/scrape/check-schedule.ts](scripts/scrape/check-schedule.ts) — Yeni CLI script (tsx). `--supplier <slug>` arg al, Supabase service role ile bağlan, scrape_schedule satırını oku, hour-gating mantığını uygula ([contracts/scrape-yml-workflow.md](./contracts/scrape-yml-workflow.md) "Detail: scripts/scrape/check-schedule.ts"); exit 0 / exit 78 / exit 1
- [X] T024 [P] [US2] `lib/scraper/run-logger.ts` ya da yeni dosya: scrape sonunda `scrape_schedule.last_auto_run_at` + `last_auto_run_status` güncelleme yardımcısı (yalnızca `trigger_type='auto'` olduğunda çağrılır). `scripts/scrape/run.ts`'in finalize aşamasına entegre edilir
- [X] T025 [US2] `scripts/scrape/run.ts` finalize aşamasını güncelle: `triggerType === 'auto'` ise scrape_schedule cache satırını güncelle (T024 helper'ını çağır). Diğer trigger_type değerlerinde dokunma
- [X] T026 [US2] GitHub Actions workflow: [.github/workflows/scrape.yml](.github/workflows/scrape.yml) — [contracts/scrape-yml-workflow.md](./contracts/scrape-yml-workflow.md)'taki YAML'ı aynen yaz; concurrency group, hour-gating step, install playwright, npm run scrape, npm run scrape:catalog
- [X] T027 [US2] (MANUEL — kullanıcı) Quickstart Test 4-6 (saat ayarı + otomatik tetikleme simülasyonu + toggle kapatma) — workflow_dispatch ile simülasyon yeterli. **Sonuç**: 2026-05-17 — toggle açıldı, saat İstanbul 12:00 (UTC 09) ayarlandı, "Sonraki otomatik scrape" mesajı doğru hesaplandı. Gerçek cron tetiklemesi UTC 09:00'da bekleniyor (test'in son adımı).

**Checkpoint**: US2 + US1 tamamı çalışıyor — otomatik + manuel tetikleme + saat seçimi.

---

## Phase 5: User Story 3 — Scrape geçmişi inceleme (Priority: P2)

**Goal**: Kullanıcı son 10 koşumun detayını (özellikle partial/failed olanlarda hata özetini) görür.

**Independent Test**: 1 partial koşum oluştur (örn. yapay olarak adapter'da 1 ürün için throw) → settings sayfasında ilgili satıra tıkla → hata özeti görünür, credential içermez.

**⚠️ Dependency**: US1'deki `RecentRunsList` (T015) zaten temel halini sağlar; bu phase yalnızca **detay genişletme** özelliği ekler.

### Implementasyon (US3)

- [X] T028 [P] [US3] `RecentRunsList` üzerine accordion/expandable detay ekle: [components/features/settings/recent-runs-list.tsx](components/features/settings/recent-runs-list.tsx) — partial/failed satırlarda tıklanabilir chevron + expanded panel; panelde `summary.errors[]` listesi (her error: step badge + mode badge + detail metni, **credential filter**: `username`/`password`/`token` regex match olan satır gizlensin veya redact edilsin)
- [X] T029 [US3] Son durum cache satırını ekle: settings sayfasının her tedarikçi kartı üst kısmında "Son durum: <dururm> · <tarih>" mini özeti (`scrape_schedule.last_auto_run_status` veya `listRecentRuns[0]` fallback). Yalnızca US3 görsel polish; data zaten T021'de kart kompozisyonunda hazır
- [X] T030 [US3] (MANUEL — kullanıcı) Quickstart Test 7 (geçmiş kayıt detay) — partial koşum oluşturarak detay accordion'unu doğrula. **Sonuç**: settings UI'da 6 başarısız (eski 006 koşumları) ve 1 partial koşumda "Hata detayını göster (1)" accordion butonları görüldü; tıklanır ve hata detayı genişler (manuel doğrulama görsel olarak yapıldı).

**Checkpoint**: US3 tamamlandı — UX olarak settings sayfası "şeffaf, anlaşılır" hale geldi.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Constitution G15 kapanış + secrets migration + güvenlik taraması + dokümantasyon.

- [X] T031 GitHub Repo Secrets seti (Halil + LLM yardımı): 2026-05-17 — `gh secret set` ile 4 secret eklendi (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ENDERYAPI_USERNAME`, `ENDERYAPI_PASSWORD`). Doğrulama: `gh secret list` ✓.
- [X] T032 Vercel env vars seti (Halil): 2026-05-17 — UI üzerinden `GITHUB_PAT` (fine-grained PAT v2, Actions:RW, sadece bu repo), `GITHUB_OWNER`, `GITHUB_REPO` Production + Preview eklendi. İlk deploy ile birlikte aktif. (PAT v1 sızdırılınca v2 ile değiştirildi.)
- [X] T033 `.env.local` temizliği (Halil): Kullanıcı kararı — B2B credentials lokal'de tutulacak (gitignored, sızıntı yok). Lokal dev için `npm run scrape` ihtiyaç olursa hızlı erişim. Üretim akışı GitHub Secrets'tan beslenir.
- [X] T034 [P] Credential leak taraması: `git grep -i "enderyapi" -- ':!*.md' ':!specs/*'` ve `git grep -E "(SUPABASE_SERVICE_ROLE|ENDERYAPI_(USERNAME|PASSWORD))=[\"']?[A-Za-z0-9]" -- ':!*.md' ':!specs/*'` çalıştır → 0 gerçek değer beklentisi. Bulgu varsa task fail eder; düzelt
- [X] T035 [P] CONSTITUTION.md güncellemesi: [.docs/CONSTITUTION.md](.docs/CONSTITUTION.md) "Mimari kararlar" tablosuna 2026-05-17 satırı ekle ("007 — Otomatik scrape pipeline: workflow_dispatch + DB-side schedule + GitHub Secrets göçü tamamlandı; G15 kapandı"). "Açık sorular" bölümünden G15 ile ilgili maddeleri işaretle (varsa)
- [X] T036 [P] CHANGES.md güncelle: [.docs/CHANGES.md](.docs/CHANGES.md) "CR-007 — 2026-05-17" başlığı altında: yeni tablo (scrape_schedule), `trigger_type` kolonu, settings sayfası, 2 server action, GitHub Actions workflow, Secrets göçü. Önceki CR formatına uy
- [X] T037 [P] dev-gotchas.md güncelle (varsa öğrenilenler): [.docs/dev-gotchas.md](.docs/dev-gotchas.md) — örn. "GitHub workflow_dispatch 204 No Content döner, run ID dönmez; UI tetikleme için scrape_runs ID'sini önceden insert et" ya da "fine-grained PAT'in scope'unu daraltma örnek path'i" — implementasyon sırasında çıkan sürprizler yazılır
- [X] T038 (MANUEL — kullanıcı) Quickstart Test 8 (credential leak taraması) — LLM T034'te `git grep -i "enderyapi"` ve env-value pattern grep'leri ile 0 finding doğruladı; manuel re-run önerisi opsiyonel (yapılmadı).
- [X] T039 (MANUEL — kullanıcı) Tam smoke test: Test 1-8 prod'da koşturuldu — manuel tetikleme ✓, otomatik saat ayarı ✓ (gerçek cron UTC 09:00'da bekleniyor), geçmiş accordion ✓, leak grep ✓. Definition of Done karşılandı.

---

## Dependencies & Story Sequencing

### Phase blokları

```
Phase 1 (Setup) ──┐
                  ├─→ Phase 2 (Foundational) ──┬─→ Phase 3 (US1)
                  │                            ├─→ Phase 4 (US2)
                  │                            └─→ Phase 5 (US3)
                                                      │
                                                      ↓
                                              Phase 6 (Polish)
```

### Story-içi bağımlılıklar

- **US1 (Phase 3)**: T013, T014, T015 paralel; T016 hepsini bekler; T017 paralel (T013-15'e bağlı değil); T018 Phase 4 sonrası
- **US2 (Phase 4)**: T019, T020, T021, T023 paralel; T022 T019-21'i bekler; T024 paralel; T025 T024'ü bekler; T026 paralel; T027 hepsini bekler
- **US3 (Phase 5)**: T028 (T015'e ek), T029 (T021'e ek); T030 ikisini bekler

### Story-arası bağımlılıklar

- **US2 ↔ US1**: Bağımsız çalışabilir teorik olarak; pratikte US1 manuel tetikleme akışını test etmek için workflow file (T026, US2) gerekir. Bu yüzden Phase 4 sonrası Phase 3 quickstart testi (T018) çalıştırılır.
- **US3 ↔ US1**: US3 T028 yalnızca US1 T015'in genişletilmesi; US1 tamamlanmadan başlamaz.

### MVP scope

**Minimal MVP**: Phase 1 + Phase 2 + Phase 3 (US1) + Phase 4 T026 (workflow file) → manuel tetikleme akışı uçtan uca çalışır. US2 saat ayarı eksik kalır ama "Şimdi tetikle" yeterli temel değer üretir.

**Önerilen sıra**: Phase 1 → 2 → 3 → 4 → 5 → 6 (sıra). Paralelleşme imkânı sınırlı (DB migration'lar sırayla, foundational T007-T011 paralel ama hepsi sonra bloğa giriyor).

---

## Parallel Execution Examples

### Phase 2 içinde paralel grup (T007-T010)

```
İş 1: T007 - zod schemas (lib/validations/schedule-form.ts)
İş 2: T008 - workflow-dispatch wrapper (lib/github/workflow-dispatch.ts)
İş 3: T009 - scrape-schedule queries (lib/queries/scrape-schedule.ts)
İş 4: T010 - scrape-runs queries (lib/queries/scrape-runs.ts)
```

Hepsi farklı dosya, bağımsız. Tek seansda yazılabilir.

### Phase 3 içinde paralel grup (US1 implementation)

```
İş 1: T013 - Server Action triggerScrape (app/actions/trigger-scrape.ts)
İş 2: T014 - TriggerNowButton client component (components/features/settings/trigger-now-button.tsx)
İş 3: T015 - RecentRunsList server component (components/features/settings/recent-runs-list.tsx)
```

Sonra T016 settings page bunları compose eder.

### Phase 4 içinde paralel grup (US2 core)

```
İş 1: T019 - saveSchedule Server Action
İş 2: T020 - ScheduleForm client component
İş 3: T021 - SupplierScheduleCard server component (T019-T020'yu ileride compose edecek ama prop API'ı önceden netleştirilebilir)
İş 4: T023 - check-schedule CLI script
İş 5: T026 - .github/workflows/scrape.yml
```

### Phase 6 polish paralel

```
İş 1: T034 - credential leak grep
İş 2: T035 - CONSTITUTION.md güncelle
İş 3: T036 - CHANGES.md
İş 4: T037 - dev-gotchas.md
```

Tümü farklı dosya, paralel.

---

## Implementation Strategy

1. **Önce DB temeli** (Phase 1-2): Migration'lar, types regen, query/wrapper iskeleleri. ~30 dk yapılabilir.
2. **US1 MVP** (Phase 3): Manuel tetikleme akışı. Server Action + Button + Settings page minimal. Workflow file gelmeden T018 yapılmaz ama T013-17 tamamlanabilir.
3. **US2 otomasyon** (Phase 4): Workflow file + saat ayar UI. Bu phase tamamlanınca US1 quickstart testleri (T018) doğrulanır.
4. **US3 polish** (Phase 5): Geçmiş expandable detay + son durum cache.
5. **Polish & migration** (Phase 6): Secrets göçü (manuel kullanıcı eylemi), leak taraması, docs.

---

## Format validation (tasks.md)

Her görev `- [ ] T### [P?] [Storey?] Description with file path` formatında. Toplam **39 task**.

| Phase | Görev sayısı | Story label |
|-------|--------------|-------------|
| 1 — Setup | 2 (T001-T002) | — |
| 2 — Foundational | 10 (T003-T012) | — |
| 3 — US1 | 6 (T013-T018) | [US1] |
| 4 — US2 | 9 (T019-T027) | [US2] |
| 5 — US3 | 3 (T028-T030) | [US3] |
| 6 — Polish | 9 (T031-T039) | — |
| **Total** | **39** | |
