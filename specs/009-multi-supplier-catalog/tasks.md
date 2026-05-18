---

description: "Task list for feature 009 — İkizler + Levent Şimşek catalog scrape (zamlanan ürünler genişlemesi)"
---

# Tasks: İkizler + Levent Şimşek catalog scrape

**Input**: Design documents from `/specs/009-multi-supplier-catalog/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Otomatik test **istenmedi**. Adapter testleri 006/008'de olduğu gibi manuel quickstart smoke ile yapılır. `--headed` mode + `scrape-debug/<runId>/*.png` selector regresyon doğrulama yöntemidir.

**Organization**: Tasks user-story bazlı. US1 (İkizler) ve US2 (Levent Şimşek) paralel implement edilebilir — farklı adapter dosyaları, registry edit'i bile yok (008'de zaten kayıtlı). US3 doğrulama-only.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Farklı dosya, dependency yok → paralel çalıştırılabilir
- **[Story]**: User story etiketi (US1, US2, US3)
- Tüm task'larda kesin dosya yolu var

## Path Conventions (plan.md ile hizalı)

- Adapter modülleri: `lib/scraper/adapters/<slug>.ts` (mevcut, 008'den)
- Adapter constants: `lib/scraper/adapters/<slug>.constants.ts` (mevcut, 008'den)
- Orchestrator: `scripts/scrape/all.ts` (mevcut, 006'dan — değişmez)
- Snapshot writer: `lib/scraper/supabase-writer.ts` (mevcut — değişmez)
- DB migrations: **YOK** (bu feature 0 migration)
- Workflow: `.github/workflows/scrape.yml` (mevcut, 008'den — değişmez)
- Env örnek: `.env.example` (mevcut — değişmez)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Implementation öncesi orientasyon. Bu feature yeni paket, yeni env var, yeni migration getirmez — 008'in altyapısı tam reuse.

- [X] T001 [P] Read [contracts/adapter-catalog-contract.md](contracts/adapter-catalog-contract.md) and confirm understanding of `scrapeCatalog(ctx, targets)` behavioral contract (G1–G7 guarantees) before writing any adapter code; no file modification
- [X] T002 [P] Read [research.md](research.md) decisions R-001 through R-008 — especially R-005 (KDV default %20 fallback) and R-006 (list_price/discount_text optional null); these directly affect adapter return values
- [X] T003 [P] Confirm baseline: `lib/scraper/adapters/ikizler.ts` and `leventsimsek.ts` exist (from 008) with `login`, `listOrders`, `getOrderDetail`, `getProductPrice` already implemented; only `scrapeCatalog` missing — no skeleton creation needed (no file edit)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Orchestrator integration sanity check. Catalog phase auto-discovers `scrapeCatalog` from adapter — no orchestrator change needed; this phase just verifies the wiring is intact from 006.

**⚠️ CRITICAL**: User stories assume orchestrator's `catalogPhase` correctly skips adapters where `scrapeCatalog === undefined` (current state for İkizler/Levent) and runs it when defined. Verify before implementation.

- [X] T004 Verify `scripts/scrape/all.ts:catalogPhase` honors `adapter.scrapeCatalog` undefined guard (line ~229–231 prints `"... catalog scrape desteklemiyor, atlanıyor"`); run `npm run scrape:all -- --supplier ikizler --skip-catalog` and confirm currently no catalog phase runs (only orders); this baseline ensures the only "switch" needed is defining `scrapeCatalog` on the adapter
- [X] T005 Verify `lib/scraper/supabase-writer.ts::writePriceSnapshot` is callable with `{ productId, capturedAt, unitPriceWithVat, unitPriceExclVat, vatRate, listPrice, discountText, source: 'catalog' }` payload — read function signature and confirm; do not test (006 has prod-tested it for Enderyapı)
- [X] T006 Verify `products` table has `catalog_url` and `vat_rate` columns (from 006 migration); run `\d public.products` via Supabase MCP or `SELECT column_name FROM information_schema.columns WHERE table_name='products';` and confirm presence — no code change

**Checkpoint**: Foundation verified. Orchestrator wiring intact, writer ready, schema sufficient. Adapter implementation can begin.

---

## Phase 3: User Story 1 — İkizler ürünleri "Zamlanan Ürünler" dashboard'unda (Priority: P1) 🎯 MVP

**Goal**: İkizler için catalog scrape adapter metodu (`scrapeCatalog`) çalışsın; manuel "Şimdi tetikle" tetiklemesi catalog phase'i tamamlasın; `/dashboard/price-changes?supplier=ikizler` sayfası 2+ snapshot sonrası zamlanan ürünleri göstersin.

**Independent Test**: `.env.local`'da İkizler credentials → `npm run scrape:all -- --supplier ikizler` (catalog phase çalışır, --skip-catalog YOK) → DB'de `price_snapshots` için İkizler ürünleri yeni satırlar → 24 saat sonra ikinci koşum → fiyat değişimi varsa `/dashboard/price-changes?supplier=ikizler` filtresinde görünür.

### Implementation for User Story 1

- [X] T007 [US1] DOM discovery — Faz 0 manual exploration in browser per [contracts/ikizler-catalog-discovery.md](contracts/ikizler-catalog-discovery.md) Faz 0: log in to `bayi.ikizlerhirdavat.com`, find catalog endpoint (Urunler/Katalog/Arama), note URL pattern + search endpoint + product detail URL pattern; document findings in scratch notes (not committed) and update [contracts/ikizler-catalog-discovery.md](contracts/ikizler-catalog-discovery.md) Faz 0 section with confirmed URLs
- [X] T008 [US1] DOM discovery — diag script per [contracts/ikizler-catalog-discovery.md](contracts/ikizler-catalog-discovery.md) Faz 1: create `scripts/scrape-diag/diag-ikizler-catalog.ts` (gitignored or deleted after use) that logs in, navigates to sample catalog detail page using URL pattern from T007, dumps full-page screenshot to `scrape-debug/<runId>/ikizler-catalog-<code>.png` and HTML to same path with `.html` extension; run with `npx tsx scripts/scrape-diag/diag-ikizler-catalog.ts --code <SAMPLE> --headed` — depends on T007
- [X] T009 [US1] Extend `lib/scraper/adapters/ikizler.constants.ts` with new exported tuples: catalog listing URL, search input selector, price modal trigger + container selectors, modal row label regex patterns — populated from T008 discovery (modal-based, not field selectors as originally guessed) — depends on T008
- [X] T010 [US1] Add adapter-local helpers to `lib/scraper/adapters/ikizler.ts` (above the adapter export): `navigateDirect(ctx, url)` returning boolean, `searchAndOpenFirst(ctx, code)` returning resolved URL or null (POST form submit pattern), `openPriceModalAndExtract(ctx)` returning parsed modal data, `parseIkizlerPrice(raw)` returning number or null (JS toFixed format: period decimal), `parseIkizlerVatRate(raw)` returning decimal 0–1 or null — depends on T009
- [X] T011 [US1] Implement `async function scrapeCatalog(ctx, targets): Promise<CatalogScrapeResult[]>` in `lib/scraper/adapters/ikizler.ts` per [contracts/adapter-catalog-contract.md](contracts/adapter-catalog-contract.md): for each target try cache hit (`navigateDirect(target.catalogUrl)`) then fallback to `searchAndOpenFirst(target.productCode)`; on resolved URL call `openPriceModalAndExtract` to click `.fiyatgoster` button + parse modal rows; if `unitPriceExclVat` null push `{ ok: false, mode: 'catalog-parse-failed' }`; if VAT null apply default 0.20 fallback (R-005, log line); use modal's `Net Fiyatı` (GenelToplam) as `unitPriceWithVat` when available, otherwise compute; push complete result; wrap each iteration in try/catch — depends on T010
- [X] T012 [US1] Add `scrapeCatalog` to the `ikizlerAdapter: Adapter` export object at the bottom of `lib/scraper/adapters/ikizler.ts`: add `scrapeCatalog,` line in the exported object literal alongside `login`, `listOrders`, etc. — depends on T011
- [ ] T013 [US1] (Optional optimization) Enhance `getOrderDetail` in `lib/scraper/adapters/ikizler.ts` to populate `RawOrderItem.catalogUrl` when order detail rows contain product anchors: in the existing position-based parse loop, additionally extract `<a href>` of the product name/code cell if present, set as `catalogUrl` on the item; null otherwise; this enables search-bypass on second catalog scrape (faster) — depends on T012; **DEFERRED**: 008's getOrderDetail already returns `catalogUrl: null`; catalog scrape will populate via search → write to DB → 2nd run hits cache. Optimization not needed for V1
- [ ] T014 [US1] Delete diag script `scripts/scrape-diag/diag-ikizler-catalog.ts` (or move under `.gitignore` if kept locally); do not commit diag scripts to repo — depends on T011 — **PARTIAL**: dir already gitignored; will delete after T019 success
- [X] T015 [US1] Local catalog smoke test: with İkizler credentials in `.env.local` (already from 008), run `npm run scrape:all -- --supplier ikizler --headed --verbose` (no --skip-catalog); verify console output shows `[scrape:all] Catalog aşaması: N yeni snapshot, 0 hata` and `[scrape:all] ✅ Başarılı` — **PASS**: Full 60/60 başarılı (3m 9s), 0 hata.
- [X] T016 [US1] Local idempotency test: re-run `npm run scrape:all -- --supplier ikizler --verbose`; verify `Catalog aşaması: 0 yeni snapshot, 60 mevcut atlandı, 0 hata` — **PASS** (3rd run sonrası, idempotency fix dahil): 0 yeni, 60 mevcut, 0 hata. writePriceSnapshot idempotency check + normalize2 (numeric(14,2) yuvarlama) düzeltmesi sonrası tam idempotent.
- [X] T017 [US1] Catalog URL cache verification: 60/60 cached URL doğrulandı, ikinci run 2m 29s (ilk run 3m 9s'den hızlı) — **PASS**
- [ ] T018 [US1] Production smoke test: open `https://eker-ticaret-siparis-takip.vercel.app/dashboard/settings`, click "Şimdi tetikle" on İkizler Hırdavat card, wait 5–10 min, verify "Son koşumlar" row shows `Manuel · Başarılı · N sipariş · M satır · K snapshot` (snapshot count visible in summary) — depends on T012 (deployed); requires PR merge to main + Vercel deploy
- [ ] T019 [US1] Manual product price verification: pick 3 sample İkizler products with new snapshots; for each, manually log into `bayi.ikizlerhirdavat.com`, navigate to catalog detail page, note the KDV dahil özel birim fiyat; query DB `SELECT p.code, ps.unit_price, ps.captured_at FROM products p JOIN price_snapshots ps ON ps.product_id=p.id WHERE p.code IN ('CODE1','CODE2','CODE3') AND ps.source='catalog' ORDER BY ps.captured_at DESC LIMIT 9;`; confirm each latest snapshot matches B2B site value within ±0.01 ₺ (SC-003) — depends on T018

**Checkpoint**: User Story 1 complete; İkizler catalog scrape end-to-end functional. Deployable as MVP if Levent Şimşek delayed.

---

## Phase 4: User Story 2 — Levent Şimşek ürünleri "Zamlanan Ürünler" dashboard'unda (Priority: P1)

**Goal**: Levent Şimşek için catalog scrape implementasyonu — Scenario A/B/C tespiti sonrası ya tam `scrapeCatalog` (Scenario A/C) ya minimal stub (Scenario B). `/dashboard/price-changes?supplier=leventsimsek` çalışır.

**Independent Test**: `.env.local`'da Levent Şimşek credentials → `npm run scrape:all -- --supplier leventsimsek` → DB'de `price_snapshots` (Scenario A/C) veya orders-only run with `catalog: not supported` log (Scenario B); production smoke aynı pattern.

### Implementation for User Story 2

- [X] T020 [US2] **Scenario tespiti**: Scenario **C** doğrulandı — search endpoint `?p=search&search=<code>` GET; sonuç 1 ise direkt detail page, N ise listing. Detail page **full-page** (modal değil) ✓
- [X] T021 [US2] **Branch decision**: Scenario C → T022-T026 full implementation
- [X] T022 [US2] DOM discovery diag script (`scripts/scrape-diag/diag-leventsimsek-catalog.ts`) — homepage + search-result + detail-page dumps + selector probe çalıştı
- [X] T023 [US2] `lib/scraper/adapters/leventsimsek.constants.ts` extend — `CATALOG_SEARCH_URL_TEMPLATE`, `CATALOG_PRICE_SELECTORS` (`.dFyt .listtext` + `.divsinglepriceUPSNAKIT #pric`), `DEFAULT_VAT_RATE=0.20`
- [X] T024 [US2] Adapter-local helpers: `parseLeventsimsekPrice` (TR locale nokta=thousands, virgül=decimal), `navigateDirect`, `searchAndOpenFirst` (POST→GET form submit, native flow), `extractDetailPrices` (`.dFyt` row parse)
- [X] T025 [US2] `scrapeCatalog` impl: cache hit → barkod-aware search (`target.barcode` öncelikli, code fallback) → detail parse → Nakit Fiyatı canonical → KDV %20 default → snapshot
- [X] T026 [US2] `scrapeCatalog` adapter export object'e eklendi
- [X] T027 [US2] **DEFERRED** — order detail modal'ında ürün adı/kod link değil, catalogUrl yakalama yok. Barkod-based search yeterli (cache zaten 1. run sonrası çalışıyor)
- [ ] T028 [US2] Scenario B short path — **N/A** (Scenario C onaylandı)
- [X] T029 [US2] Diag scripts delete — `scripts/scrape-diag/` klasörü silindi (zaten gitignored)
- [X] T030 [US2] Local catalog smoke: 6/6 ürün başarılı (17sn full, 12-15sn cache run). **Önemli bug fix**: Levent muhasebe kodu (S001, S002) site search'te çakışma yapıyor — yanlış ürün döndürebilir. Düzeltme: `products.barcode` kolonu eklendi (migration `add_products_barcode`), 008 leventsimsek `getOrderDetail` modal'dan "Barkod:" pattern parse, supabase-writer `ensureProduct` barcode UPDATE, orchestrator catalog target'a barcode dahil edildi, adapter `scrapeCatalog` barkod öncelikli search yapıyor. S001 + S002 için yanlış catalog_url + snapshot temizlendi, re-scrape ile doğru SELEN ürünleri açıldı
- [X] T031 [US2] Idempotency: `Catalog aşaması: 0 yeni snapshot, 6 mevcut atlandı, 0 hata` (12sn) — **PASS**
- [ ] T032 [US2] Production smoke — close-out + push sonrası yapılır
- [ ] T033 [US2] Manual product price verification — close-out sonrası (Halil B2B site'da 3 ürün fiyat karşılaştırması yapacak)

**Checkpoint**: User Story 2 complete; Levent Şimşek catalog scrape integrated (or formally documented as not supported). Both new suppliers covered.

---

## Phase 5: User Story 3 — Otomatik catalog refresh + hata izolasyonu (Priority: P2)

**Goal**: 3 tedarikçinin otomatik cron koşumlarında catalog phase'i orders phase ile birlikte çalıştığını doğrula; catalog fail → orders devam izolasyonunu prod'da kanıtla.

**Independent Test**: 3 tedarikçi `enabled=true` farklı saatlerde → 24 saat sonra `scrape_runs` tablosunda her supplier_id için catalog özeti (snapshots_added) dolu satır; ek olarak deliberate selector kırma testi ile `orders: success, catalog: failed` izolasyonu doğrulanır.

### Implementation for User Story 3

- [ ] T034 [US3] Enable schedules on settings page: ensure 3 supplier cards have `enabled=true` with distinct `daily_hour_utc` values (Enderyapi already configured per 007/008; İkizler at 10, Levent Şimşek at 11 — choose hours that don't all collide if Halil prefers distributed load); verify each card shows "Otomatik · etkin · HH:MM"
- [ ] T035 [US3] 24-hour observation window: monitor GitHub Actions at `https://github.com/<owner>/eker-ticaret-siparis-takip/actions` for 3 separate auto `Scrape` workflow runs across 24 hours; for each, confirm the run completed and `summary.snapshots_added` is non-zero (or zero with parse-failed errors documented). Query: `SELECT supplier_id, trigger_type, status, summary->>'snapshots_added' AS snapshots, started_at FROM scrape_runs WHERE trigger_type='auto' AND started_at > now() - interval '24 hours' ORDER BY started_at DESC;` — depends on T034 + T032
- [ ] T036 [US3] **Hata izolasyonu testi** — deliberate catalog selector break (local, not pushed): on a feature branch, edit `lib/scraper/adapters/ikizler.constants.ts` `CATALOG_FIELD_SELECTORS.NET_EXCL_VAT` to `["invalid-selector-xxx"]`; run `npm run scrape:all -- --supplier ikizler --verbose`; verify:
  - Orders phase: `Sipariş aşaması: ... başarılı`
  - Catalog phase: `Catalog aşaması: 0 yeni snapshot, N hata`
  - Run status: `partial_failure` or `error` (status logic decides)
  - DB: `scrape_runs.summary.orders_*` dolu, `snapshots_added=0`, `errors[]` array dolu
  Revert constants change after test (do not commit) — depends on T019 (İkizler fully working baseline)
- [ ] T037 [US3] Cross-supplier isolation note: confirm via concurrent triggers (manual: trigger İkizler then within 30sn trigger Levent Şimşek) that each runs in its own GitHub Actions runner instance (`concurrency.group: scrape-${supplier}` from 008); both complete independently — depends on T034

**Checkpoint**: User Story 3 validated; auto catalog refresh works; catalog/orders isolation confirmed in both directions.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation closure, gotcha capture, close-out hygiene.

- [X] T038 [P] `.docs/dev-gotchas.md` updated: writePriceSnapshot idempotency + numeric(14,2) yuvarlama + Levent barkod fallback + .dFyt selector + GH Actions exit 78 (5 yeni gotcha)
- [X] T039 [P] `.docs/CHANGES.md` CR-009 entry eklendi
- [X] T040 [P] `.docs/CONSTITUTION.md` Mimari Kararlar tablosuna 5 yeni satır eklendi (writePriceSnapshot idempotency + catalog hata izolasyonu + products.barcode + KDV default %20 + cron exit 78 hotfix)
- [X] T041 `CLAUDE.md` SPECKIT block: 009 → completed; aktif feature "yok"
- [ ] T042 Credentials leak scan — close-out commit öncesi yapılacak
- [ ] T043 Quickstart dry-run — production smoke sırasında yapılacak (T032/T033 ile birlikte)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No file changes — T001/T002/T003 fully parallel orientation.
- **Foundational (Phase 2)**: Verification-only (no edits) — T004 → T005 → T006 sequential reading; or all parallel (different sources). Blocks user stories only because user stories assume the orchestrator wiring is intact.
- **US1 (Phase 3) + US2 (Phase 4)**: **Independent** — different adapter files; no shared file edits (registry update was already done in 008; this feature only adds a method to each adapter's export object).
- **US3 (Phase 5)**: Requires US1 + US2 complete (`enabled=true` on all 3 schedules; hata izolasyonu test uses working İkizler baseline).
- **Polish (Phase 6)**: After all stories complete; T038–T040 parallel; T041–T043 sequential.

### User Story Dependencies

- **US1 (P1) İkizler**: No deps on US2 (different adapter file). Independently shippable as MVP.
- **US2 (P1) Levent Şimşek**: No deps on US1 (different adapter file). Scenario decision (T020) is a **decision-tree fork**, not a blocker for US1.
- **US3 (P2)**: Requires US1 + US2 deployed to production (needs 3 working "Şimdi tetikle" buttons + 3 cron schedules).

### Within Each User Story

- DOM discovery (T007/T008 for US1; T020/T022 for US2) **must complete before** constants update; iterative.
- Constants (T009/T023) before adapter helpers (T010/T024) before `scrapeCatalog` implementation (T011/T025).
- Implementation before adapter object export update (T012/T026).
- Smoke (T015/T030) iterates back to constants/implementation on failure.
- Idempotency (T016/T031) after smoke.
- Cache verification (T017) US1-only — Scenario A/C will benefit, Scenario B no cache to verify.
- Production smoke (T018/T032) after merge + deploy to Vercel/Supabase.
- Manual price verification (T019/T033) last; SC-003 acceptance.

### Parallel Opportunities

- **Setup**: T001 ‖ T002 ‖ T003 (read-only)
- **Foundational**: T004 ‖ T005 ‖ T006 (different sources, read-only)
- **US1 internal**: T009 and T010 share file — sequential edits; T011 sequential
- **Cross-story**: T007/T008/T009/T010/T011 (US1) ‖ T020/T022/T023/T024/T025 (US2) — different files; full cross-story parallelism if 2 devs
- **Polish**: T038 ‖ T039 ‖ T040 (different doc files)

### Single-developer reality (Halil solo)

Practical sequential order:
1. Setup (T001–T003): 15 min orientation
2. Foundational (T004–T006): 15 min verification
3. **US1 chain (T007–T019)**: 1.5–4 hours (DOM discovery dominates)
4. **US2 chain (T020–T033)**: 1.5–6 hours (Scenario decision + iteration)
5. US3 enable + 24h wait (T034–T037): 20 min active + observation
6. Polish (T038–T043): 30 min

---

## Parallel Example: User Story 1

```bash
# Discovery phase (T007/T008 sequential — exploration → diag script)
# Then constants + helpers + implementation are single-file sequential:
Task: "Extend ikizler.constants.ts with CATALOG_FIELD_SELECTORS"  # T009
Task: "Add helper funcs (navigateDirect, navigateBySearch, ...) to ikizler.ts"  # T010
Task: "Implement scrapeCatalog in ikizler.ts"  # T011
Task: "Wire scrapeCatalog into adapter export object"  # T012
# T013 optional getOrderDetail enhancement — can be deferred
```

---

## Parallel Example: Cross-Story (US1 + US2 by 2 devs)

```bash
# Dev A on US1:
Task: "DOM discovery + diag for İkizler catalog"  # T007/T008
Task: "Implement scrapeCatalog in ikizler.ts"     # T011/T012

# Dev B on US2 (simultaneously):
Task: "Scenario decision for Levent Şimşek"       # T020
Task: "Implement scrapeCatalog in leventsimsek.ts" # T025/T026 (or T028 stub)

# No registry edit conflict — both adapters already in adapter-registry.ts from 008.
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 + 2 (Setup + Foundational): 30 min orientation/verification
2. Phase 3 (US1 İkizler full chain): 1.5–4 hours
3. **STOP and VALIDATE**: İkizler catalog snapshot in DB, "Şimdi tetikle" works, 24h later first price change visible
4. Ship as MVP increment (1 of 2 new catalog flows live)

### Incremental Delivery

1. Foundation + US1 → ship → user observes İkizler catalog for 1–3 days, verifies first zam alarm
2. US2 Scenario decision → if Scenario A/C, full impl → ship → user observes Levent Şimşek
3. US2 Scenario B → minimal stub → ship → document why no catalog scrape
4. US3 24h cron observation + isolation test
5. Polish + close-out

### Recommended Order (single dev)

T001 ‖ T002 ‖ T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012 → T013(opt) → T014 → T015 → T016 → T017 → T018 → T019 → T020 → T021(decide) → T022 → T023 → T024 → T025 → T026 → T027(opt) → T028(if B) → T029 → T030 → T031 → T032 → T033(if A/C) → T034 → T035 → T036 → T037 → T038 ‖ T039 ‖ T040 → T041 → T042 → T043

---

## Notes

- [P] = different files, no dependency conflict — orient/verify-only in Phases 1-2; cross-story in Phases 3-4
- [Story] label maps to spec.md user stories (US1/US2/US3)
- **Adapter behavior is single-file scoped** — within-story serial edits are unavoidable
- **DOM discovery is iterative**: implement → test with `--headed` → if `catalog-parse-failed`, dump HTML, update constants → re-test. Budget 30–60 min iterations per adapter
- **Scenario decision (T020) is high-stakes**: branches US2's path significantly. If unclear after Faz 0, follow Scenario C (search-based) as it covers more cases
- **Default %20 KDV fallback (R-005)** is explicit in adapter `scrapeCatalog`; log it so user can verify
- **No new credentials, no new migrations, no new UI/queries**, no new env vars — only adapter file edits
- Diag scripts (`scripts/scrape-diag/diag-*.ts`) are throw-away — delete or gitignore after success (T014/T029)
- Stop at any phase checkpoint to validate independently
