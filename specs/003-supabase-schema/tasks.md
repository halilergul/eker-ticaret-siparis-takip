---
description: "Task list — feature 003 Supabase schema implementation"
---

# Tasks: Supabase Schema — Tedarikçi Sipariş & Fiyat Takibi

**Input**: Design documents from `/specs/003-supabase-schema/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/schema-sql.md

**Tests**: pgTAP / Vitest test paketleri OPSİYONEL — bu feature için test task'ı eklenmedi; manuel doğrulama [quickstart.md](./quickstart.md) üzerinden (QS-00 → QS-08).

**Organization**: Task'lar user story bazında gruplandı. US1 = MVP (idempotent yazma), US2 = fiyat snapshot, US3 = multi-supplier.

## Format

`- [ ] [TaskID] [P?] [Story?] Description with file path`

- `[P]`: paralel çalıştırılabilir (farklı dosya, eş zamanlı sırasında tamamlanmamış bağımlılık yok)
- `[Story]`: US1 / US2 / US3 (Setup/Foundational/Polish'te yok)

## Path Conventions

- Repo kökünde Next.js proje yapısı (Constitution → Stack Detayları)
- Migration dosyaları: `supabase/migrations/<YYYYMMDDHHMMSS>_<short_name>.sql`
- TS types: `lib/supabase/database.types.ts`
- Supabase MCP komutları: `mcp__supabase__apply_migration`, `mcp__supabase__execute_sql`, `mcp__supabase__get_advisors`, `mcp__supabase__generate_typescript_types`

---

## Phase 1: Setup

- [X] T001 Verify `pgcrypto` extension is installed via `mcp__supabase__list_extensions`; if not installed (`installed_version=null`), apply a one-off migration `supabase/migrations/<ts>_00_enable_pgcrypto.sql` with `CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;` (per research R-001). Note: PoC confirmed it's already installed; this step is a defensive check.
- [X] T002 Ensure `supabase/migrations/` directory exists and snapshot current state: list `mcp__supabase__list_migrations` and `mcp__supabase__list_tables(schemas=["public"])`; record baseline (expected: 1 migration `20260515203748_revoke_rls_auto_enable_from_public`, 0 tables in public schema).

---

## Phase 2: Foundational — Blocking Prerequisites

> No foundational tasks for this feature. Each migration is self-contained and applied in order; there is no cross-cutting infrastructure required before any user story. We move directly to US1 once setup is verified.

---

## Phase 3: User Story 1 — Scraper sonuçlarını veritabanına kalıcı yazma (P1) 🎯 MVP

**Story goal**: 4 tablo (`suppliers`, `supplier_orders`, `order_items`, `products`) + `set_updated_at` trigger + RLS politikaları kurulur; idempotent insert + RESTRICT/CASCADE doğrulanır. (US1 + US3 ortak: `suppliers` ve unique constraint pattern. Schema multi-supplier'a hazır kurulur; US3 sadece çoklu kayıt eklemekten ibaret olur.)

**Independent Test**: Quickstart QS-01 (idempotent insert, 3 kez aynı sipariş → satır sayıları sabit) + QS-04 (constraint ihlalleri) geçer.

- [X] T003 [US1] Apply migration `01_core_tables` via `mcp__supabase__apply_migration({ name: "01_core_tables", query: <SQL from contracts/schema-sql.md "Migration 01"> })` — creates `suppliers`, `supplier_orders`, `order_items`, `products`, `price_snapshots` with all CHECK + UNIQUE constraints and FK relationships. Write the SAME SQL to `supabase/migrations/<ts>_01_core_tables.sql` (G14 compliance per research R-010).
- [X] T004 [US1] Apply migration `02_updated_at_trigger` via `mcp__supabase__apply_migration({ name: "02_updated_at_trigger", query: <SQL from contracts/schema-sql.md "Migration 02"> })` — creates `public.set_updated_at()` function and binds `BEFORE UPDATE` triggers on `suppliers`, `supplier_orders`, `order_items`, `products` (not on `price_snapshots`, which is immutable). Write same SQL to `supabase/migrations/<ts>_02_updated_at_trigger.sql`.
- [X] T005 [US1] Apply migration `03_rls_policies` via `mcp__supabase__apply_migration({ name: "03_rls_policies", query: <expand pattern from contracts/schema-sql.md "Migration 03"> })` — `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on all 5 tables + 4 policies (SELECT/INSERT/UPDATE/DELETE) per table, all gated on `auth.uid() IS NOT NULL`. Total 20 policies. Write same SQL to `supabase/migrations/<ts>_03_rls_policies.sql`.
- [X] T006 [US1] Apply migration `05_seed_enderyapi` via `mcp__supabase__apply_migration({ name: "05_seed_enderyapi", query: "INSERT INTO public.suppliers (slug, name, base_url) VALUES ('enderyapi', 'Enderyapi B2B', 'https://b2b.enderyapi.com.tr') ON CONFLICT (slug) DO NOTHING;" })`. Write same SQL to `supabase/migrations/<ts>_05_seed_enderyapi.sql`. (`04_record_price_observation` is reserved for US2 — applied there.)
- [X] T007 [US1] Verify migrations + tables via `mcp__supabase__list_migrations` (expect 5 entries incl. baseline) and `mcp__supabase__list_tables(schemas=["public"], verbose=true)`; confirm all 5 tables exist with correct columns, constraints, FKs, and RLS enabled. Document any discrepancies in [specs/003-supabase-schema/quickstart.md](./quickstart.md) QS-00.
- [X] T008 [P] [US1] Run [quickstart.md](./quickstart.md) QS-01 (idempotent insert of order ESP018-12345 + 3 items, 3 times; expect counts stable at orders=1, items=3) via `mcp__supabase__execute_sql`; fill the result table in QS-01.
- [X] T009 [P] [US1] Run [quickstart.md](./quickstart.md) QS-04 (constraint violations: dup slug → 23505, bad slug format → 23514, negative total → 23514, supplier RESTRICT → 23503, order CASCADE → 0 items) via `mcp__supabase__execute_sql`; fill the result table in QS-04.

**Checkpoint**: US1 MVP done when T007 + T008 + T009 all pass. Schema can absorb scraper output idempotently. 004 feature (real scraper) can start writing to these tables.

---

## Phase 4: User Story 2 — Ürün fiyatlarındaki değişimi otomatik kaydet (P2)

**Story goal**: `record_price_observation` RPC kurulur; aynı fiyat snapshot eklemez, farklı fiyat ekler ve `products.current_unit_price`'i günceller.

**Independent Test**: Quickstart QS-02 — 5 gözlem (100, 100, 110, 110, 95) sonrasında 3 snapshot + `current_unit_price=95` + en son `products.name` yansır.

**Dependencies**: US1 tamamlanmış olmalı (tablolar var). `price_snapshots` tablosu T003'te oluştu — bu fazda fonksiyon kurulur.

- [X] T010 [US2] Apply migration `04_record_price_observation` via `mcp__supabase__apply_migration({ name: "04_record_price_observation", query: <SQL from contracts/schema-sql.md "Migration 04"> })` — creates `public.record_price_observation(p_supplier_id, p_product_code, p_product_name, p_unit_price, p_captured_at)` with the branching logic (new product → insert + snapshot; existing + price changed → snapshot + update products; existing + same price → only update name/last_seen_at; price NULL → no snapshot, no current_unit_price change). `SECURITY INVOKER`, `SET search_path = public, pg_temp` (research R-013). Write same SQL to `supabase/migrations/<ts>_04_record_price_observation.sql`.
- [X] T011 [US2] Verify function exists via `mcp__supabase__execute_sql("SELECT proname, pronargs FROM pg_proc WHERE proname='record_price_observation';")` — expect 1 row with pronargs=5.
- [X] T012 [US2] Run [quickstart.md](./quickstart.md) QS-02 (5 calls to `record_price_observation` with prices 100, 100, 110, 110, 95 for `VDA-TEST-001`; expect `price_snapshots` count=3, `products.current_unit_price=95`, `products.name='Vida test (yeni ad)'`) via `mcp__supabase__execute_sql`; fill the result table in QS-02.

**Checkpoint**: US2 done when T012 passes. Fiyat takibi end-to-end çalışır.

---

## Phase 5: User Story 3 — Çoklu tedarikçi desteği (P3)

**Story goal**: İkinci tedarikçi eklenir; aynı ürün kodu iki tedarikçide iki ayrı `products` satırı oluşturur; aynı tedarikçide aynı kod ikinci kez `23505` döner.

**Independent Test**: Quickstart QS-05 — `acme-b2b` supplier eklenir, aynı `code='VDA-M8'` iki supplier için insert → 2 satır; aynı supplier'da dup → 23505.

**Dependencies**: US1 tamamlanmış olmalı (`suppliers`, `products` tabloları + unique constraint).

- [X] T013 [US3] Run [quickstart.md](./quickstart.md) QS-05 (insert 2nd supplier `acme-b2b`, insert `code='VDA-M8'` for both → expect 2 rows in `products`; retry within same supplier → expect 23505; cleanup) via `mcp__supabase__execute_sql`; fill the result table in QS-05.

**Checkpoint**: US3 done when T013 passes. Schema multi-supplier'a doğrulanmış.

---

## Phase 6: Polish & Cross-Cutting

- [X] T014 [P] Run `mcp__supabase__get_advisors({ type: "security" })`; verify zero critical (error/warn) findings. Fill quickstart.md QS-06 result row for security. If critical findings appear (e.g., RLS misconfig), pause and fix in a follow-up migration.
- [X] T015 [P] Run `mcp__supabase__get_advisors({ type: "performance" })`; verify zero critical findings. Fill quickstart.md QS-06 result row for performance.
- [X] T016 Generate TS types via `mcp__supabase__generate_typescript_types`; write the full output to `lib/supabase/database.types.ts` (overwrite). Verify it exports `Database` containing all 5 tables and `record_price_observation` function signature (research R-011).
- [X] T017 Update `lib/supabase/client.ts` and `lib/supabase/server.ts` to add `<Database>` generic on the underlying Supabase client factory call (`createBrowserClient<Database>`, `createServerClient<Database>`). Import path: `import type { Database } from "./database.types";`. No other behavior change.
- [X] T018 Run `npm run build` (or `npx tsc --noEmit`) to verify type-check is clean with the new `Database` types; fill quickstart.md QS-07 result table.
- [X] T019 Run [quickstart.md](./quickstart.md) QS-03 (RLS verification: service role count >0, `SET ROLE anon; SELECT count(*) FROM public.suppliers;` returns 0) via `mcp__supabase__execute_sql`. Note: full authenticated client RLS test requires browser session — defer to 004 feature; only document service vs anon contrast here.
- [X] T020 Run [quickstart.md](./quickstart.md) QS-08 (cleanup: delete test rows `VDA-TEST-001`, `ESP018-%`). Leave `enderyapi` seed and an empty production-ready state.
- [X] T021 Final summary: fill the "Toplam doğrulama özeti" table at the bottom of [quickstart.md](./quickstart.md) — check off SC-001 → SC-006 against actual results.
- [X] T022 Append CHANGES log entry `CR-003 — Feature 003-supabase-schema tamamlandı (kod)` to [.docs/CHANGES.md](../../.docs/CHANGES.md), listing: 5 migrations applied + dosyaları, types yazıldı, advisors temiz, 8 QS senaryosu manuel doğrulandı. Add any newly discovered gotchas to [.docs/dev-gotchas.md](../../.docs/dev-gotchas.md) (e.g., RLS quirks, MCP behaviors).

---

## Dependencies & Story Completion Order

```
Setup (T001-T002)
  └── US1 (T003-T009)  ← MVP CHECKPOINT
        ├── US2 (T010-T012)
        └── US3 (T013)
              └── Polish (T014-T022)
```

- **US1** depends on Setup. Once T007 passes, scraper integration (004 feature) can begin against US1 schema even before US2/US3 finish.
- **US2** depends on US1 (needs tables before function).
- **US3** depends on US1 (needs `suppliers` + `products` unique constraints).
- **Polish** depends on US1+US2+US3 (final verification, type generation against final schema).

## Parallel Execution Opportunities

Tasks marked `[P]` can run in parallel:

- **T008 & T009**: After T007 passes (tables verified), QS-01 (idempotency) and QS-04 (constraints) operate on independent test data — run concurrently via two `execute_sql` calls.
- **T014 & T015**: Two independent advisor scans (`security`, `performance`) — run concurrently.

Sequential-only tasks (each blocks the next):
- T003 → T004 → T005 → T006 (each migration assumes previous applied)
- T010 must wait for T007 (function references `products` and `price_snapshots`)
- T016 must wait for T010 (types reflect final function signature)
- T017 must wait for T016 (imports types from generated file)

## Implementation Strategy

**MVP scope (recommended start)**: T001 → T007 (Setup + US1). At T007 checkpoint the database is ready for 004 scraper integration even without `record_price_observation`. Scraper can simulate price tracking application-side in the meantime (not ideal but unblocking).

**Incremental delivery**:
1. **Day 1 (MVP)**: T001 → T009 — schema + idempotency proven. 004 can start.
2. **Day 1+**: T010 → T013 — RPC + multi-supplier proven.
3. **Day 1++**: T014 → T022 — polish, types, advisors, CHANGES log.

**Risk**: if `mcp__supabase__apply_migration` fails for any reason mid-sequence, drop the offending tables manually via `execute_sql` and re-run from the failed migration. Migrations are designed idempotent at the schema level (CREATE TABLE without IF NOT EXISTS — so re-running same migration after partial failure requires DROP first).

## Format Validation

All 22 tasks follow the strict checklist format:
- ✅ Checkbox prefix `- [ ]`
- ✅ Task ID (T001-T022)
- ✅ `[P]` marker on parallel-safe tasks (T008, T009, T014, T015)
- ✅ `[US1]` / `[US2]` / `[US3]` story labels in Phase 3-5 only; absent in Setup/Polish
- ✅ Exact file paths (`supabase/migrations/...`, `lib/supabase/database.types.ts`, MCP commands, quickstart sections)
