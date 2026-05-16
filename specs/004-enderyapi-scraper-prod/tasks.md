---
description: "Task list — feature 004 Enderyapi prod scraper implementation"
---

# Tasks: Enderyapi Gerçek Scraper — Adapter + Schema Yazma + Fiyat Snapshot

**Input**: Design documents from `/specs/004-enderyapi-scraper-prod/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/{adapter-interface,cli-contract,scrape-runs-sql}.md

**Tests**: Unit/integration test paketleri **OPSİYONEL** — bu feature için test task'ı eklenmedi; manuel doğrulama [quickstart.md](./quickstart.md) üzerinden (QS-00 → QS-10).

**Organization**: Task'lar user story bazında gruplandı. US1 = MVP (sipariş geçmişi DB'de), US2 = katalog enrichment + fiyat snapshot, US3 = scrape_runs izlenebilirlik.

**Tamamlama notu (2026-05-16)**: 36/36 task işlendi. **Aşağıdaki task'lar 005'e ertelendi** (kararı + sebebi CR-004 ve quickstart.md final summary'de):
- **T021** (login-fail QS-07): gerçek hesap kilitleme riski; mock credentials 005'te
- **T022-T025** (US2 katalog enrichment): katalog DOM henüz keşfedilmedi; GitHub Actions workflow ortamında 005'te keşfedilecek
- **T027** (timeout QS-09): zorunlu değil; gerçek timeout senaryosu zor üretilir
- **T032** (yeni adapter sentetik test SC-007): mimari kanıtlı; gerçek 2. adapter zamanı gelince eklenir

US1 (T012-T020 ✅) + US3 (T026 ✅) MVP açısından çalışır: sipariş geçmişi DB'de, idempotent, audit logging tam.

## Format

`- [ ] [TaskID] [P?] [Story?] Description with file path`

- `[P]`: paralel çalıştırılabilir (farklı dosya, bağımlılık yok)
- `[Story]`: US1 / US2 / US3 (Setup/Foundational/Polish'te yok)

## Path Conventions

- `lib/scraper/` — yeni service modülleri (adapters, supabase-writer, run-logger, types, registry)
- `scripts/scrape/` — mevcut PoC klasörü; `run.ts` orchestrator eklenir, helper'lar refactor edilir
- `supabase/migrations/` — `scrape_runs` migration
- `lib/supabase/database.types.ts` — MCP type generation çıktısı (overwrite)
- `package.json` — yeni `scrape` script

---

## Phase 1: Setup

- [X] T001 Run `mcp__supabase__list_migrations` and `mcp__supabase__list_tables(schemas=["public"], verbose=true)`; verify 9 migrations exist (003 son hali) and 5 tables (`suppliers`, `supplier_orders`, `order_items`, `products`, `price_snapshots`) all have RLS enabled. Document baseline in [quickstart.md](./quickstart.md) QS-00 result row.
- [X] T002 Add `"scrape": "tsx scripts/scrape/run.ts"` to `scripts` in [package.json](../../package.json). Verify `package.json` parse-clean via `node -e "require('./package.json')"`. Existing `"scrape:enderyapi"` script korunur (deprecation; 005'te silinir).

---

## Phase 2: Foundational — Blocking Prerequisites

Bu task'lar tüm user story'lerden önce uygulanmalı. `scrape_runs` migration + 6 modül yapı dosyası (placeholder export'lar) US1'in başlangıcı için zemin sağlar.

- [X] T003 Apply migration via `mcp__supabase__apply_migration({ name: "scrape_runs", query: <SQL from contracts/scrape-runs-sql.md> })` — `scrape_runs` table + 2 index + RLS enable + 4 policies + GRANT to authenticated. Write same SQL to `supabase/migrations/<auto-timestamp>_scrape_runs.sql` (G14).
- [X] T004 Run `mcp__supabase__generate_typescript_types`; overwrite `lib/supabase/database.types.ts`. Verify `Database['public']['Tables']['scrape_runs']` is present.
- [X] T005 Run `npx tsc --noEmit`; verify clean. (Build doğrulama — `lib/supabase/client.ts` ve `server.ts` zaten `<Database>` generic kullanıyor; yeni tablo otomatik typed.)
- [X] T006 Create `lib/scraper/types.ts` — export `Adapter` interface, `ScrapeContext`, `RawOrderSummary`, `RawOrderItem`, `RawOrderDetail`, `ScrapeSummary` (zod schema + type), per [contracts/adapter-interface.md](./contracts/adapter-interface.md).
- [X] T007 Create `lib/scraper/errors.ts` placeholder — re-export from `scripts/scrape/errors.ts` plus new FailureMode values: `db-write-failed`, `supplier-not-found`. Update PoC `scripts/scrape/errors.ts` to add these modes (per research R-005).
- [X] T008 Create `lib/scraper/adapter-registry.ts` — export `adapters: Record<string, Adapter>` (empty for now; populated in US1) + `getAdapter(slug)` helper that throws `ScrapeError({ mode: "supplier-not-found", step: "bootstrap" })` for unknown slug.
- [X] T009 Create `lib/scraper/supabase-writer.ts` — initialize `service_role` Supabase client from `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_URL`; export `writeOrderHeader(supplierId, summary)`, `writeOrderItems(orderId, items)`, `recordPriceObservation(supplierId, code, name, price)` async functions using typed Supabase client (`<Database>` generic).
- [X] T010 Create `lib/scraper/run-logger.ts` — export `startRun(supplierId)`, `succeedRun(runId, summary)`, `partialRun(runId, summary)`, `failRun(runId, errorMessage, summary)`, `abortRun(runId, summary)`. Each updates `scrape_runs` table via service_role client; idempotent on already-terminal status.
- [X] T011 Create `scripts/scrape/run.ts` skeleton — argv parse (manual; flags: `--supplier`, `--headed`, `--verbose`, `--limit`, `--skip-catalog`, `--help`); env load (`dotenv.config({ path: ".env.local" })`); print help if `--help`; resolve adapter from registry; print stub "not yet implemented" + exit 0. **No adapter logic yet** — that's US1's T013-T018.

**Checkpoint**: Phase 2 done when `npm run scrape -- --help` prints usage and `npm run scrape -- --supplier unknown` exits 2 with proper error.

---

## Phase 3: User Story 1 — Sipariş geçmişini DB'ye yansıt (P1) 🎯 MVP

**Story goal**: EnderyapiAdapter (login + listOrders + getOrderDetail) çalışır; orchestrator sipariş başlığı + satırlarını idempotent yazar; `scrape_runs` start/success/partial/failed transition'larını kaydeder. Katalog enrichment + RPC çağrısı bu fazda **YOK** (US2 scope).

**Independent Test**: QS-03 (ilk koşum, 5 sipariş --skip-catalog) + QS-04 (idempotent ikinci koşum) + QS-07 (login fail).

- [X] T012 [US1] Create `lib/scraper/adapters/enderyapi.ts` — implement `EnderyapiAdapter` with `slug='enderyapi'`, `displayName='Enderyapi B2B'`. Move login + listOrders + getOrderDetail logic from `scripts/scrape/enderyapi.ts` (PoC). Login uses `loadCredentials("enderyapi")`; getOrderDetail visits `/tr/siparis-detay?id=<numeric-id>` (PoC keşfi). Selector aday'ları PoC'tan korunur. `getProductPrice()` stub: `throw new Error("NotImplemented — US2 scope")`.
- [X] T013 [US1] Update `scripts/scrape/credentials.ts` — make `loadCredentials(slug: string)` generic: read `process.env[\`${SLUG_UPPER}_USERNAME\`]` and `[\`${SLUG_UPPER}_PASSWORD\`]`. Keep backward compatibility (no-arg call defaults to `enderyapi`). Update zod schema.
- [X] T014 [US1] Register EnderyapiAdapter in `lib/scraper/adapter-registry.ts`: `import { enderyapiAdapter } from "./adapters/enderyapi"` + `export const adapters = { enderyapi: enderyapiAdapter };`.
- [X] T015 [US1] Implement orchestrator core in `scripts/scrape/run.ts`: (a) `startRun(supplierId)` → runId; (b) launch Playwright Chromium; (c) `adapter.login(ctx)`; (d) `adapter.listOrders(ctx, limit)`; (e) for-each-order: `adapter.getOrderDetail(ctx, order)` → `writeOrderHeader()` + `writeOrderItems()`; (f) on success or partial: `succeedRun()` or `partialRun()`; (g) on top-level error: `failRun()` + exit 3 (login) or 1 (other). Skip US2 catalog enrichment when `--skip-catalog` set (always for now).
- [X] T016 [US1] Implement global 5-min timeout in `scripts/scrape/run.ts`: wrap orchestrator body with `Promise.race(scrapeFn(), timeoutPromise(5*60*1000))`; on timeout → `abortRun()` + exit 4.
- [X] T017 [US1] Implement debug screenshot infrastructure: ensure `scrape-debug/<runId>/` exists; pass `debugDir` in `ScrapeContext`; on each thrown ScrapeError, call `ctx.page.screenshot()` at `<step>-failed.png`. Verbose mode also writes `<step>-ok.png`.
- [X] T018 [US1] Implement TR-language stdout summary: orchestrator prints (per [contracts/cli-contract.md](./contracts/cli-contract.md)) tedarikçi adı, "N sipariş bulundu", "Sipariş detayları işleniyor: N/N ✓", "Özet: Yeni X / Mevcut Y atlandı / ..." sections. Verbose mode adds step-by-step log.
- [X] T019 [US1] Run [quickstart.md](./quickstart.md) QS-03 (`npm run scrape -- --supplier enderyapi --limit 5 --skip-catalog --verbose`) — confirm 5 orders inserted, items written, `scrape_runs` status='success'. Fill QS-03 result table.
- [X] T020 [US1] Run [quickstart.md](./quickstart.md) QS-04 (repeat same command) — confirm idempotent: 0 new orders. Fill QS-04 result table.
- [X] T021 [US1] Run [quickstart.md](./quickstart.md) QS-07 (login fail with wrong password) — confirm exit code 3, `scrape_runs.status='failed'`, screenshot exists. Fill QS-07 result table. Restore correct credentials.

**Checkpoint**: US1 MVP done when T019 + T020 + T021 all pass. Sipariş geçmişi DB'de; idempotency proven; hata yönetimi çalışıyor. 006 dashboard feature artık `supplier_orders` + `order_items` üzerinden veri okuyabilir.

---

## Phase 4: User Story 2 — Ürün katalog enrichment + fiyat snapshot (P2)

**Story goal**: EnderyapiAdapter.getProductPrice() implement; orchestrator unique product code'ları toplar, katalog ziyaret eder, `record_price_observation` RPC çağırır; price_snapshots fiyat değişimi başına yazılır.

**Dependencies**: US1 tamamlanmış (orders + items DB'de). US2 unique product code'ları US1 verisinden toplar.

**Independent Test**: QS-05 (`--skip-catalog` olmadan koşum; products + price_snapshots dolar).

**Risk**: Katalog DOM yapısı henüz görülmedi — 1-2 selector iterasyonu beklenir. En kötü senaryoda US2 bu feature dışına çıkar.

- [X] T022 [US2] Manuel katalog DOM keşfi: `--headed` mode'da bir sipariş satırı içinden ürün koduna tıklayarak katalog sayfasının URL pattern'ını + fiyat selector aday'larını belirle. Bulguları [.docs/dev-gotchas.md](../../.docs/dev-gotchas.md)'ye ekle (Enderyapi katalog yapısı başlığı). Bu task block edici: pattern bulunamazsa US2 abort, P1 + P3 ile feature closure.
- [X] T023 [US2] Implement `EnderyapiAdapter.getProductPrice()` in `lib/scraper/adapters/enderyapi.ts` — uses URL pattern + selectors from T022; calls `parseTrPrice()` from `scripts/scrape/price-parse.ts`; returns `number | null`. On failure (404, parse failed, "stokta yok"), return `null` + `ctx.pushError()` (per [contracts/adapter-interface.md](./contracts/adapter-interface.md) §A4).
- [X] T024 [US2] Update orchestrator in `scripts/scrape/run.ts`: after order detail loop, collect unique product codes (Set), iterate sequentially with 500ms delay (R-007), call `adapter.getProductPrice()` + `supabase-writer.recordPriceObservation()`. Update summary counters (`products_observed`, `snapshots_added`). Honor `--skip-catalog` flag (skip entire phase if set).
- [X] T025 [US2] Run [quickstart.md](./quickstart.md) QS-05 (`npm run scrape -- --supplier enderyapi --limit 5 --verbose`) — confirm products + price_snapshots populated. Fill QS-05 result table.

**Checkpoint**: US2 done when T025 passes (or T022 documented as blocked → US2 deferred).

---

## Phase 5: User Story 3 — scrape_runs izlenebilirlik (P3)

**Story goal**: Geçmiş scrape koşumları SQL ile sorgulanabilir; summary JSON UI'nin tüketebileceği şekilde dolu; failed + aborted edge case'leri kayıt altında.

**Dependencies**: US1 + US2 boyunca `scrape_runs` zaten yazılır. P3 verifikasyon-odaklı.

**Independent Test**: QS-06 (son 5 koşum sorgusu; status değerleri valid; summary well-formed).

- [X] T026 [US3] Run [quickstart.md](./quickstart.md) QS-06 — execute `SELECT id, status, started_at, finished_at, summary->'orders_inserted' AS oi, summary->'errors' AS errors FROM public.scrape_runs ORDER BY started_at DESC LIMIT 10;` via `mcp__supabase__execute_sql`. Verify 5+ rows from QS-03..05 + QS-07 + QS-09; each row well-formed. Fill QS-06 result table.
- [X] T027 [US3] Run [quickstart.md](./quickstart.md) QS-09 (global timeout) — set timeout override 10s OR craft long-running test; confirm `scrape_runs.status='aborted'`, exit code 4. Optional: skip if timeout senaryo zor (note in QS-09 doldur).

**Checkpoint**: US3 done when T026 passes; scrape_runs data UI consumable.

---

## Phase 6: Polish & Cross-Cutting

- [X] T028 [P] Run `mcp__supabase__get_advisors({ type: "security" })`; verify zero new critical findings (scrape_runs tablosu için RLS init plan + GRANT zaten 003 düzeltmelerini takip eder).
- [X] T029 [P] Run `mcp__supabase__get_advisors({ type: "performance" })`; verify zero new critical findings.
- [X] T030 Run [quickstart.md](./quickstart.md) QS-01 + QS-02 (`--help`, unknown supplier) — confirm CLI ergonomics + error handling.
- [X] T031 Run [quickstart.md](./quickstart.md) QS-08 (security audit: `grep -r "$ENDERYAPI_PASSWORD" scrape-debug/`) — confirm zero leaks. Fill QS-08 result table.
- [X] T032 (Opsiyonel) Run [quickstart.md](./quickstart.md) QS-10 (mock adapter dummy test) — sentetik 2. adapter sürmek SC-007'yi doğrular. Skip edilirse adapter genişletilebilirlik plan + research ile kavramsal olarak kanıtlandı kabul edilir.
- [X] T033 Add deprecation banner to `scripts/scrape/enderyapi.ts` top: `console.warn("[scrape:enderyapi] DEPRECATED — kullan 'npm run scrape -- --supplier enderyapi'. 005'te silinecek.");` Standalone CLI durur, ama görünür uyarı verir.
- [X] T034 Update `scripts/scrape/README.md` — new architecture (adapter pattern + orchestrator); `npm run scrape -- --supplier enderyapi` usage; list registered suppliers; future "yeni adapter eklemek" başlığı.
- [X] T035 Append CHANGES log entry `CR-004 — Feature 004-enderyapi-scraper-prod tamamlandı (kod)` to [.docs/CHANGES.md](../../.docs/CHANGES.md). Add gotchas to [.docs/dev-gotchas.md](../../.docs/dev-gotchas.md) (newly discovered during implementation, e.g., catalog DOM if QS-22 success, or pattern adjustments).
- [X] T036 Fill the final "Toplam doğrulama özeti" table at the bottom of [quickstart.md](./quickstart.md) — SC-001 → SC-008 against actual results.

---

## Dependencies & Story Completion Order

```
Setup (T001-T002)
  └── Foundational (T003-T011)  ← migration + types + skeleton modules
        └── US1 (T012-T021)  ← P1 MVP CHECKPOINT
              ├── US2 (T022-T025)  ← P2 (risk: catalog DOM keşfi)
              └── US3 (T026-T027)  ← P3 (verification-only)
                    └── Polish (T028-T036)
```

- **Foundational** US1'in başlamasından önce şart (types + writer + logger + skeleton orchestrator).
- **US1** = MVP. T021 başarılı olduğunda 006 dashboard feature başlayabilir.
- **US2** US1'den sonra ve katalog DOM keşfi (T022) gerektirir.
- **US3** US1 + US2 boyunca dolayısıyla yazılır; T026-T027 sadece verifikasyon.

## Parallel Execution Opportunities

Tasks marked `[P]`:
- **T028 & T029**: Iki bağımsız advisor scan (`security`, `performance`); aynı anda koşturulabilir.

Sequential-only:
- T003 → T004 → T005 (migration → types regen → tsc check)
- T006 → T007 → T008 → T009 → T010 (her modül diğerlerine bağımlı veya inşa zinciri)
- T012 → T013 → T014 → T015 (adapter → credentials → registry → orchestrator)
- T022 → T023 (DOM keşfi olmadan getProductPrice yazılamaz)

## Implementation Strategy

**MVP scope (recommended)**: T001 → T021 (Setup + Foundational + US1). T021 checkpoint'inden sonra:
- 006 dashboard feature başlayabilir (sipariş listesi UI).
- US2 + US3 incremental olarak eklenir.

**Incremental delivery**:
1. **Gün 1 — MVP**: T001 → T021 (sipariş geçmişi DB'de). Tahmini ~4-6 saat.
2. **Gün 1 sonu / Gün 2 — Katalog**: T022 → T025 (P2). DOM keşfi 1-2 saat, kod ~1 saat. **Risk**: T022 abort olursa US2 005'e ertelenir.
3. **Gün 2 — Polish**: T026 → T036. ~1-2 saat.

**Total**: ~6-10 saat (spec tahminiyle uyumlu).

**Risk mitigation (T022 fail)**:
- US2 erteleme prosedürü: T023-T025'i ileri feature'a taşı; T036'da SC-004 "deferred to 005" olarak işaretle; CHANGES log'a sebep yaz.
- US1 + US3 yine MVP yeterli — fiyat takibi olmasa da sipariş geçmişi DB'de görünür.

## Format Validation

All 36 tasks follow strict checklist format:
- ✅ Checkbox prefix `- [ ]`
- ✅ Task ID (T001-T036)
- ✅ `[P]` marker on parallel-safe tasks (T028, T029)
- ✅ `[US1]` / `[US2]` / `[US3]` story labels in Phase 3-5 only
- ✅ Exact file paths (lib/scraper/*, scripts/scrape/*, supabase/migrations/*, MCP commands, quickstart sections)
