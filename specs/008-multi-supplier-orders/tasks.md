---

description: "Task list for feature 008 — İkizler + Levent Şimşek tedarikçileri (sipariş scrape)"
---

# Tasks: İkizler + Levent Şimşek tedarikçileri (sipariş scrape)

**Input**: Design documents from `/specs/008-multi-supplier-orders/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Otomatik test **istenmedi**. Adapter testleri 006/007'de olduğu gibi manuel quickstart smoke ile yapılır. Bu yüzden Vitest/Playwright test task'ı eklenmedi; `--headed` mode + `scrape-debug/*.png` selector regresyon doğrulama yöntemidir.

**Organization**: Tasks user-story bazlı gruplandırılmıştır. US1 ve US2 paralel implement edilebilir (farklı adapter dosyaları); US3 saf doğrulama.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Farklı dosya, dependency yok → paralel çalıştırılabilir
- **[Story]**: User story etiketi (US1, US2, US3)
- Tüm task'larda kesin dosya yolu var

## Path Conventions (plan.md ile hizalı)

- Adapter modülleri: `lib/scraper/adapters/<slug>.ts`
- Adapter constants: `lib/scraper/adapters/<slug>.constants.ts`
- Adapter registry: `lib/scraper/adapter-registry.ts`
- DB migrations: `supabase/migrations/2026MMDDhhmmss_<name>.sql` (MCP üretir)
- Workflow: `.github/workflows/scrape.yml`
- Env örnek: `.env.example`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Implementation öncesi hazırlık. Yeni paket yok, build setup yok — sadece env ve dokümantasyon hazırlığı.

- [X] T001 [P] Update `.env.example` to include placeholder lines for `IKIZLER_USERNAME=`, `IKIZLER_PASSWORD=`, `LEVENTSIMSEK_USERNAME=`, `LEVENTSIMSEK_PASSWORD=` (sadece anahtar, değer boş; commit edilir)
- [X] T002 [P] Read [contracts/adapter-contract.md](contracts/adapter-contract.md) and confirm understanding of Adapter interface behavioral contract before writing any adapter code (no file modification — orientation only)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: US1 ve US2'nin runtime'da çalışabilmesi için zorunlu DB + workflow altyapısı. Bu faz tamamlanmadan adapter'lar çalıştırılamaz.

**⚠️ CRITICAL**: Hiçbir user story bu fazdan önce çalıştırılamaz. Migration + workflow YAML zorunlu.

- [X] T003 Apply DB seed migration adding 2 new supplier rows (ikizler + leventsimsek) to `public.suppliers` via `mcp__supabase__apply_migration({ name: "seed_ikizler_leventsimsek", query: <SQL from data-model.md §Seed Migration 1> })`; verify with `SELECT slug, name FROM suppliers ORDER BY slug;` returning 3 rows
- [X] T004 Apply DB seed migration adding 2 new `scrape_schedule` rows (enabled=false, daily_hour_utc=9) via `mcp__supabase__apply_migration({ name: "seed_schedule_ikizler_leventsimsek", query: <SQL from data-model.md §Seed Migration 2> })`; verify with `SELECT s.slug, ss.enabled, ss.daily_hour_utc FROM suppliers s JOIN scrape_schedule ss ON ss.supplier_id = s.id ORDER BY s.slug;` returning 3 rows — depends on T003
- [X] T005 Update `.github/workflows/scrape.yml`: expand `supplier` input `choice options` to `[enderyapi, ikizler, leventsimsek]`; add 4 new env mappings (`IKIZLER_USERNAME/PASSWORD`, `LEVENTSIMSEK_USERNAME/PASSWORD`) under `jobs.scrape.env:` from `secrets.*` (secrets eklenmesi T015 ve T026'da; YAML reference güvenli — eksik secret runtime'da empty string olur)
- [X] T006 Verify settings UI auto-discovery: load `/dashboard/settings` (dev or prod) and confirm 3 supplier cards render in order Enderyapi, İkizler Hırdavat, Levent Şimşek using `lib/queries/scrape-schedule.ts::listAllSchedules()` (no code change — DB-driven; this is a UI smoke check, not a code task) — depends on T003, T004

**Checkpoint**: Foundation ready — adapter implementation can begin in parallel for US1 and US2.

---

## Phase 3: User Story 1 — İkizler siparişlerinin dashboard'da görünmesi (Priority: P1) 🎯 MVP

**Goal**: İkizler Hırdavat tedarikçisi için login + sipariş listesi + sipariş detay scrape akışı çalışsın; settings UI'dan "Şimdi tetikle" ile manuel tetikleme başarılı olsun; siparişler dashboard filtresinde İkizler seçilebilir olsun.

**Independent Test**: `.env.local`'a İkizler credentials gir → `npm run scrape:all -- --supplier ikizler --skip-catalog` → `[scrape:all] ✅ Başarılı` → DB'de `supplier_orders` İkizler satırları → `/dashboard?supplier=ikizler` filtresi → en az 3 sipariş satırının ürün kodu+miktar+birim fiyat alanları B2B sitedeki ile birebir eşleşmeli.

### Implementation for User Story 1

- [X] T007 [P] [US1] Create `lib/scraper/adapters/ikizler.constants.ts` with exported readonly tuples: `SITE_BASE_URL = "http://bayi.ikizlerhirdavat.com"`, `LOGIN_PATHS`, `ORDER_HISTORY_PATHS`, `LOGIN_SELECTORS` (USERNAME_INPUTS / PASSWORD_INPUTS / SUBMIT_BUTTONS / VERIFICATION_TOKEN_INPUT), `ORDER_LIST_SELECTORS` (ROW_CONTAINERS + per-column candidate arrays), `ORDER_DETAIL_SELECTORS` (ITEM_ROWS + per-column candidates), `TIMEOUTS` — values stay TBD initial (placeholder arrays) and refined during Faz 0–3 discovery (see [contracts/ikizler-discovery.md](contracts/ikizler-discovery.md))
- [X] T008 [P] [US1] Create `lib/scraper/adapters/ikizler.ts` skeleton exporting `ikizlerAdapter: Adapter` with `slug: "ikizler"`, `displayName: "İkizler Hırdavat"`, and async stubs for `login`, `listOrders`, `getOrderDetail`, `getProductPrice` (each throwing `ScrapeError({ mode: "not-implemented", step: "ikizler-<method>" })` initially); import types from `lib/scraper/types.ts` and constants from `./ikizler.constants.ts`
- [X] T009 [US1] Register adapter in `lib/scraper/adapter-registry.ts`: add `import { ikizlerAdapter } from "./adapters/ikizler";` and add `ikizler: ikizlerAdapter,` to the `adapters` map — depends on T008
- [X] T010 [US1] Implement `login(ctx)` in `lib/scraper/adapters/ikizler.ts` following Faz 0–1 discovery in [contracts/ikizler-discovery.md](contracts/ikizler-discovery.md): use `loadCredentials("ikizler")` from `scripts/scrape/credentials.ts`, navigate `bayi.ikizlerhirdavat.com/Home/Giris`, fill username/password using `tryFindSelector` pattern (enderyapi precedent), submit, verify redirect away from login URL, call `detectCaptcha(page)` and `detect2FA(page)`; throw appropriate `ScrapeError` modes (`login-failed`, `captcha`, `2fa-required`, `unexpected-dom`, `timeout`) per [contracts/adapter-contract.md](contracts/adapter-contract.md) — credential values must never appear in error messages or logs (FR-011); save debug screenshot to `ctx.debugDir/login-success.png` on success — depends on T007, T008
- [X] T011 [US1] Implement `listOrders(ctx, limit)` in `lib/scraper/adapters/ikizler.ts` following Faz 2 discovery: navigate to order history URL discovered manually, parse `<table>` rows or order cards using `ORDER_LIST_SELECTORS.ROW_CONTAINERS` candidates, extract `orderNo`, `status`, `orderedAt` (parse `DD.MM.YYYY` to ISO using existing `parseTrDate` helper or reimplement locally), `totalAmount` (parse TR-formatted price using `parseTrPrice` from `scripts/scrape/price-parse.ts`), optional `detailUrl`; follow pagination links up to 50-page cap; respect `limit` parameter; return empty array on `empty-history`; throw `ScrapeError` for `unexpected-dom`/`parse-failed`/`timeout` — depends on T010
- [X] T012 [US1] Implement `getOrderDetail(ctx, order)` in `lib/scraper/adapters/ikizler.ts` following Faz 3 discovery: navigate using `order.detailUrl` or constructed URL from `order.orderNo`, parse item rows using `ORDER_DETAIL_SELECTORS.ITEM_ROWS` candidates, extract `productCode`, `productName`, `quantity` (integer/decimal), `unitPriceAtOrder` (KDV dahil), optional `catalogUrl`; skip unparseable rows with `pushError` warning but do not fail entire order; return `{ summary: order, items }` — depends on T011
- [X] T013 [US1] Implement `getProductPrice` as placeholder in `lib/scraper/adapters/ikizler.ts`: `async function getProductPrice(): Promise<number | null> { return null; }` per R-006 decision in research.md — depends on T008
- [X] T014 [US1] Local smoke test: add `IKIZLER_USERNAME=<value>` and `IKIZLER_PASSWORD=<value>` to `.env.local` (developer machine only, never committed), run `npm run scrape:all -- --supplier ikizler --skip-catalog --headed --verbose`, verify `[scrape:all] ✅ Başarılı` output and `scrape-debug/<runId>/` contains debug screenshots; refine selectors in `ikizler.constants.ts` if any phase fails (iterate T010/T011/T012 → T014 until pass) — depends on T012, T013
- [X] T015 [US1] Local idempotency test: re-run `npm run scrape:all -- --supplier ikizler --skip-catalog` and verify summary shows `orders_inserted: 0, orders_skipped: N` (mevcut atlandı) — depends on T014
- [X] T016 [US1] Add `IKIZLER_USERNAME` and `IKIZLER_PASSWORD` secrets to GitHub repo at `https://github.com/<owner>/eker-ticaret-siparis-takip/settings/secrets/actions`; values from user-shared credentials (not committed to repo) — depends on T015 (manual setup outside repo)
- [X] T017 [US1] Production smoke test via settings UI: open `https://eker-ticaret-siparis-takip.vercel.app/dashboard/settings`, click "Şimdi tetikle" on the İkizler Hırdavat card, wait 5–10 min, verify "Son koşumlar" shows `Manuel · Başarılı · N sipariş · M satır` row; verify `/dashboard?supplier=ikizler` filter displays İkizler orders — depends on T005, T009, T016
- [ ] T018 [US1] Manual product code/price verification: pick 3 sample orders from `/dashboard?supplier=ikizler`, open detail page, compare `product_code`, `quantity`, `unit_price_at_order` against the same order on B2B site (`bayi.ikizlerhirdavat.com`); SC-003 requires exact match — depends on T017

**Checkpoint**: User Story 1 complete; İkizler integration end-to-end functional. Deployable as MVP if Levent Şimşek is delayed.

---

## Phase 4: User Story 2 — Levent Şimşek siparişlerinin dashboard'da görünmesi (Priority: P1)

**Goal**: Levent Şimşek Armatür tedarikçisi için aynı login + sipariş listesi + sipariş detay akışı çalışsın; UI'da 3. kart aktif; siparişler filtresinde Levent Şimşek seçilebilir.

**Independent Test**: `.env.local`'a Levent Şimşek credentials gir → `npm run scrape:all -- --supplier leventsimsek --skip-catalog` → `[scrape:all] ✅ Başarılı` → DB'de `supplier_orders` Levent Şimşek satırları → `/dashboard?supplier=leventsimsek` filtresi → en az 3 sipariş satırının alanları B2B sitedeki ile birebir.

### Implementation for User Story 2

- [X] T019 [P] [US2] Create `lib/scraper/adapters/leventsimsek.constants.ts` with exported readonly tuples: `SITE_BASE_URL = "https://liste.leventsimsekarmatur.com"`, `LOGIN_PATHS` (PHP patterns: `/index.php`, `/index.php?action=login`, etc.), `ORDER_HISTORY_PATHS`, `LOGIN_SELECTORS`, `ORDER_LIST_SELECTORS`, `ORDER_DETAIL_SELECTORS`, `TIMEOUTS` — values refined during discovery (see [contracts/leventsimsek-discovery.md](contracts/leventsimsek-discovery.md))
- [X] T020 [P] [US2] Create `lib/scraper/adapters/leventsimsek.ts` skeleton exporting `leventsimsekAdapter: Adapter` with `slug: "leventsimsek"`, `displayName: "Levent Şimşek Armatür"`, async stubs throwing `ScrapeError({ mode: "not-implemented", step: "leventsimsek-<method>" })`
- [X] T021 [US2] Register adapter in `lib/scraper/adapter-registry.ts`: add `import { leventsimsekAdapter } from "./adapters/leventsimsek";` and add `leventsimsek: leventsimsekAdapter,` to the `adapters` map — depends on T020 (and on T009 to avoid edit conflict — sequential edit of same file)
- [X] T022 [US2] Implement `login(ctx)` in `lib/scraper/adapters/leventsimsek.ts` following Faz 0–1 in [contracts/leventsimsek-discovery.md](contracts/leventsimsek-discovery.md): use `loadCredentials("leventsimsek")`, navigate to login URL, fill PHP form fields, submit, handle CSRF token if present (Playwright auto-handles via native form flow), verify redirect, call `detectCaptcha`/`detect2FA`; throw appropriate `ScrapeError` modes; save debug screenshot — depends on T019, T020
- [X] T023 [US2] Implement `listOrders(ctx, limit)` in `lib/scraper/adapters/leventsimsek.ts` following Faz 2: navigate to order history, parse table rows, extract fields (Türkçe karakter + apostrof/tırnak içerebilen armatür ürün adlarına dikkat — CSS class-based selectors required, no text-based matching), handle PHP `?page=N` pagination, respect `limit`; return empty array on empty history — depends on T022
- [X] T024 [US2] Implement `getOrderDetail(ctx, order)` in `lib/scraper/adapters/leventsimsek.ts` following Faz 3: navigate to detail page (PHP `?action=siparis_detay&id=N` pattern likely), parse item rows, extract `productCode`/`productName`/`quantity`/`unitPriceAtOrder` — armatür-spesifik: product names may contain `"`, `'`, `/`, parentheses; Postgres text columns handle these safely — depends on T023
- [X] T025 [US2] Implement `getProductPrice` placeholder in `lib/scraper/adapters/leventsimsek.ts`: `async function getProductPrice(): Promise<number | null> { return null; }` — depends on T020
- [X] T026 [US2] Local smoke test: add `LEVENTSIMSEK_USERNAME=<value>` and `LEVENTSIMSEK_PASSWORD=<value>` to `.env.local`, run `npm run scrape:all -- --supplier leventsimsek --skip-catalog --headed --verbose`, verify success and screenshots; refine selectors in `leventsimsek.constants.ts` until pass — depends on T024, T025
- [X] T027 [US2] Local idempotency test: re-run same command, verify `orders_inserted: 0, orders_skipped: N` — depends on T026
- [X] T028 [US2] Add `LEVENTSIMSEK_USERNAME` and `LEVENTSIMSEK_PASSWORD` secrets to GitHub repo at `https://github.com/<owner>/eker-ticaret-siparis-takip/settings/secrets/actions` — depends on T027
- [X] T029 [US2] Production smoke test via settings UI: click "Şimdi tetikle" on Levent Şimşek Armatür card, wait 5–10 min, verify success row in "Son koşumlar"; verify `/dashboard?supplier=leventsimsek` filter — depends on T005, T021, T028
- [ ] T030 [US2] Manual product code/price verification: pick 3 sample orders, compare fields against `liste.leventsimsekarmatur.com` B2B site; SC-003 — depends on T029

**Checkpoint**: User Story 2 complete; Levent Şimşek integration end-to-end functional. Both new suppliers live; MVP+1 reached.

---

## Phase 5: User Story 3 — Çoklu tedarikçi cron tetiklemesi (Priority: P2)

**Goal**: Üç tedarikçi (Enderyapi + İkizler + Levent Şimşek) bağımsız saatlerde otomatik scrape edilebilsin; cron + concurrency.group altyapısı yeni tedarikçileri sorunsuz kapsasın.

**Independent Test**: 3 tedarikçi farklı `daily_hour_utc` ile `enabled=true` yapılır → 24 saat içinde `scrape_runs` tablosunda 3 ayrı `trigger_type='auto'` satır görünür (her supplier_id için 1 tane).

### Implementation for User Story 3

- [ ] T031 [US3] Open `/dashboard/settings`, enable schedule on İkizler card with `daily_hour_utc=10` (İstanbul 13:00), enable schedule on Levent Şimşek card with `daily_hour_utc=11` (İstanbul 14:00); Enderyapi keeps existing user setting; verify each card shows "Otomatik · etkin · HH:MM" status — depends on Phase 2 + Phase 3 + Phase 4 complete
- [ ] T032 [US3] Observation window 24 hours: after enable, monitor GitHub Actions tab at `https://github.com/<owner>/eker-ticaret-siparis-takip/actions` for 3 separate `Scrape` workflow runs across 24h (one per supplier_id at its scheduled UTC hour); confirm each run has `trigger_type=auto` in the `scrape_runs` table (`SELECT supplier_id, trigger_type, started_at FROM scrape_runs WHERE trigger_type='auto' AND started_at > now() - interval '24 hours' ORDER BY started_at DESC;`) — depends on T031

**Checkpoint**: User Story 3 validated; multi-supplier cron automation confirmed via real-world 24h observation.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation closure, gotcha capture, security verification.

- [X] T033 [P] Update `.docs/CONSTITUTION.md` "Mimari kararlar" table with a new row dated 2026-05-17: "008: İkizler HTTP plaintext riski kabul edildi" with rationale linking to spec FR-012; preserve existing rows
- [X] T034 [P] Update `.docs/CONSTITUTION.md` "Mimari kararlar" table with a second new row dated 2026-05-17: "008: Per-adapter constants file pattern (`<slug>.constants.ts`)" with rationale linking to research.md R-001
- [X] T035 [P] Update `.docs/dev-gotchas.md` with new gotcha entry/entries capturing any DOM discovery surprises encountered during T010–T012 and T022–T024 (e.g., site-specific CSRF token handling, unexpected redirects, pagination quirks); skip if discovery was uneventful
- [X] T036 [P] Update `.docs/CHANGES.md` with CR-008 entry: feature title, date 2026-05-17, branch, summary listing 2 new adapter modules + 2 seed migrations + workflow YAML update + 4 new GitHub Secrets
- [X] T037 Credentials leak scan: run `git grep -E "IKIZLER_(USERNAME|PASSWORD)|LEVENTSIMSEK_(USERNAME|PASSWORD)" -- . ':!.env.example' ':!**/specs/**' ':!**/.docs/**'` and confirm output contains only `process.env.*` code references (no hardcoded values); run `git grep -E "(IKIZLER|LEVENTSIMSEK)_PASSWORD=[a-zA-Z0-9]" -- .` and confirm 0 findings (SC-005 verification) — depends on Phase 3 + Phase 4 complete
- [ ] T038 Run [quickstart.md](quickstart.md) end-to-end as a deployment dry-run: walk through all 8 sections checking each verification step; report any gaps or stale instructions back to plan.md
- [X] T039 Update `CLAUDE.md`: move `008-multi-supplier-orders` from active to completed feature list (between `<!-- SPECKIT START --> ... <!-- SPECKIT END -->`), set active feature back to "yok" or next planned feature (009 catalog) — depends on T038

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately. T001 and T002 fully parallel.
- **Foundational (Phase 2)**: After Setup. T003 → T004 sequential (T004 reads supplier ids); T005 parallel with T003; T006 after T003+T004. BLOCKS all user stories at runtime (adapter cannot find supplier_id without seed migrations).
- **US1 (Phase 3) + US2 (Phase 4)**: Independent of each other except for T009/T021 (both touch `adapter-registry.ts` — sequential). Can be developed by 1 person back-to-back or 2 devs in parallel with merge coordination.
- **US3 (Phase 5)**: Requires both US1 and US2 complete (T030) — 3 suppliers must exist and be triggerable.
- **Polish (Phase 6)**: After all stories complete; T033–T036 parallel; T037–T039 sequential.

### User Story Dependencies

- **US1 (P1) İkizler**: No deps on US2 (different adapter file). Independently shippable.
- **US2 (P1) Levent Şimşek**: No behavioral deps on US1; only file-level conflict on `adapter-registry.ts` (T009 vs T021). Sequential merge.
- **US3 (P2) Cron**: Requires US1 + US2 complete (needs 3 enabled suppliers).

### Within Each User Story

- Constants file (T007/T019) [P] with adapter skeleton (T008/T020)
- Adapter skeleton must exist before registry update (T009/T021)
- `login` before `listOrders` before `getOrderDetail` (each builds on previous browser state)
- `getProductPrice` placeholder parallel with any other task (single line)
- Local smoke after all 4 methods (T014/T026)
- Idempotency after smoke (T015/T027)
- GitHub Secrets before prod smoke (T016 before T017; T028 before T029)
- Manual price verification last (T018/T030)

### Parallel Opportunities

- **Setup phase**: T001 ‖ T002
- **Foundational**: T005 ‖ (T003 → T004)
- **US1 internal**: T007 ‖ T008 ‖ T013
- **US2 internal**: T019 ‖ T020 ‖ T025
- **Cross-story**: T007/T008 (US1) ‖ T019/T020 (US2) — different files
- **Polish**: T033 ‖ T034 ‖ T035 ‖ T036

### Single-developer reality

Halil is solo dev. [P] markers indicate "no conflict if you want to context-switch", not literal multi-worker parallelism. Practical sequence:
1. Setup (T001–T002): 10 min
2. Foundational (T003–T006): 30 min
3. US1 İkizler full chain (T007–T018): 1–4 hours
4. US2 Levent Şimşek full chain (T019–T030): 1–4 hours
5. US3 enable cron + wait 24h (T031–T032): 10 min active + observation
6. Polish (T033–T039): 30 min

---

## Parallel Example: User Story 1

```bash
# Skeleton tasks in parallel (different files, no behavioral deps):
Task: "Create lib/scraper/adapters/ikizler.constants.ts with placeholder selectors"  # T007
Task: "Create lib/scraper/adapters/ikizler.ts skeleton with stub methods"            # T008
Task: "Add getProductPrice placeholder returning null"                                # T013
# (T009 registry update must wait for T008 to exist)

# Sequential adapter behavior:
Task: "Implement login(ctx) in ikizler.ts"                # T010 — single file edit
Task: "Implement listOrders(ctx) in ikizler.ts"           # T011 — same file
Task: "Implement getOrderDetail(ctx) in ikizler.ts"       # T012 — same file
```

---

## Parallel Example: Cross-Story (US1 + US2 by 2 devs)

```bash
# Dev A on US1:
Task: "Create lib/scraper/adapters/ikizler.constants.ts"  # T007
Task: "Create lib/scraper/adapters/ikizler.ts skeleton"   # T008

# Dev B on US2 (simultaneously):
Task: "Create lib/scraper/adapters/leventsimsek.constants.ts"  # T019
Task: "Create lib/scraper/adapters/leventsimsek.ts skeleton"   # T020

# Merge coordination at registry edit:
#   Dev A pushes T009, then Dev B rebases and pushes T021 (or both edit in 1 PR).
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (Setup): T001–T002 — 10 min
2. Phase 2 (Foundational): T003–T006 — 30 min
3. Phase 3 (US1 İkizler): T007–T018 — 1–4 hours
4. **STOP and VALIDATE**: İkizler orders visible in dashboard, "Şimdi tetikle" works in production
5. Ship to user as MVP increment (1 of 2 new suppliers live)

### Incremental Delivery

1. Foundation + US1 → ship → user tests İkizler for 1–2 days
2. US2 Levent Şimşek → ship → user tests Levent Şimşek
3. US3 cron observation → 24h wait → verify auto runs
4. Polish + close-out

### Recommended Order (single dev)

T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T013 → T010 → T011 → T012 → T009 → T014 → T015 → T016 → T017 → T018 → T019 → T020 → T025 → T022 → T023 → T024 → T021 → T026 → T027 → T028 → T029 → T030 → T031 → T032 → T033 → T034 → T035 → T036 → T037 → T038 → T039

---

## Notes

- [P] = different files, no dependency conflict
- [Story] label maps to spec.md user stories (US1/US2/US3)
- All adapter behavior is single-file scoped (`lib/scraper/adapters/<slug>.ts`) — within-story serial edits are unavoidable; across-story parallelism is real
- Selector discovery (T010/T011/T012 and T022/T023/T024) is **iterative**: implement → test with `--headed` → if `unexpected-dom`, update constants → re-test. Budget 30–60 min iterations per method per site.
- Credentials must NEVER be committed; `.env.local` is gitignored, GitHub Secrets are the only persistent store (G15 disciplini).
- Each task has explicit file path. No vague "implement adapter" tasks.
- Stop at any phase checkpoint to validate independently.
- Avoid: editing `adapter-registry.ts` from two stories simultaneously without coordination.
