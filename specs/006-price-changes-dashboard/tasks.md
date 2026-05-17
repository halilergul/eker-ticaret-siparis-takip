---
description: "Task list — feature 006 fiyat fark dashboard'u (catalog scrape + KDV-aware tracking + UI)"
---

# Tasks: Fiyat Fark Dashboard'u (Catalog Scraping + Alarm UI)

**Input**: Design documents from `/specs/006-price-changes-dashboard/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/{routes,data-queries,catalog-scraper}.md

**Tests**: Vitest unit testleri **OPSİYONEL** — bu feature için test task'ı eklenmedi; manuel doğrulama [quickstart.md](./quickstart.md) (QS-00 → QS-12).

**Organization**: Task'lar user story bazında gruplandı. US1 = MVP (zamlanan ürünler listesi), US2 = ürün detay/tarihçe, US3 = catalog scraper.

## Format

`- [ ] [TaskID] [P?] [Story?] Description with file path`

- `[P]`: paralel çalıştırılabilir (farklı dosya, bağımlılık yok)
- `[Story]`: US1 / US2 / US3 (Setup/Foundational/Polish'te yok)

## Path Conventions

- `app/(app)/dashboard/` — route'lar
- `components/features/price-changes/` — feature component'leri (yeni klasör)
- `lib/queries/{price-changes,products}.ts` — data layer
- `lib/format/percent.ts` — yüzde format helper (yeni)
- `lib/constants/price-changes.ts` — sabitler (yeni)
- `lib/validations/price-changes-filter.ts` — zod schema (yeni)
- `lib/routes.ts` — route sabitleri (mevcut, güncellenir)
- `lib/scraper/` — adapter mimarisi (mevcut, genişler)
- `scripts/scrape/catalog.ts` — yeni CLI orchestrator
- `supabase/migrations/` — 3 yeni migration

---

## Phase 1: Setup

- [X] T001 Verify build baseline: `npx tsc --noEmit` clean; `npm run dev` started; `/dashboard` (005 sonrası) çalışır. Sadece doğrulama; kod değişikliği yok.
- [X] T002 Verify `order_items.product_id` FK presence ve dolum durumu: `mcp__supabase__execute_sql("SELECT column_name FROM information_schema.columns WHERE table_name='order_items' AND column_name='product_id';")` ve `SELECT count(*) FILTER (WHERE product_id IS NOT NULL), count(*) FROM order_items;`. Sonuca göre Phase 2'de T007 koşullu çalıştırılır.

---

## Phase 2: Foundational — Blocking Prerequisites

Tüm 3 user story'nin paylaştığı zemin: 3 schema migration + types regen + lib modülleri.

- [X] T003 [P] Create migration `supabase/migrations/<timestamp>_add_vat_rate_to_products.sql`: `ALTER TABLE public.products ADD COLUMN vat_rate numeric(5,4) NOT NULL DEFAULT 0.20 CHECK (vat_rate >= 0 AND vat_rate <= 1);` + COMMENT. `mcp__supabase__apply_migration` ile uygula.
- [X] T004 [P] Create migration `supabase/migrations/<timestamp>_extend_price_snapshots_with_components.sql`: `price_snapshots`'a 5 yeni kolon ekle — `unit_price_with_vat numeric(10,2)`, `list_price numeric(10,2)`, `discount_text text`, `vat_rate numeric(5,4)`, `source text NOT NULL DEFAULT 'catalog' CHECK (source IN ('catalog', 'order'))`. Detay [data-model.md](./data-model.md) §1.2.
- [X] T005 Create migration `supabase/migrations/<timestamp>_create_get_price_changes_rpc.sql`: `CREATE OR REPLACE FUNCTION public.get_price_changes(window_days int DEFAULT 7, include_drops boolean DEFAULT false) RETURNS TABLE (...) LANGUAGE sql SECURITY INVOKER SET search_path = public, pg_temp AS $$ ... $$;` + `GRANT EXECUTE ... TO authenticated, service_role;`. Detay [data-model.md](./data-model.md) §1.3. **Önkoşul**: T003 + T004 (RPC `vat_rate` ve `unit_price_with_vat` kolonlarını referans alır).
- [X] T006 (Conditional) Create migration `supabase/migrations/<timestamp>_add_product_id_to_order_items.sql` — sadece T002 sonucu `order_items.product_id` yoksa: `ALTER TABLE public.order_items ADD COLUMN product_id uuid REFERENCES public.products(id) ON DELETE SET NULL; CREATE INDEX order_items_product_id_idx ON public.order_items (product_id);`. Eğer kolon var ama doluluk eksikse skip et (backfill T032'de scraper içinde).
- [X] T007 Regenerate `lib/supabase/database.types.ts`: `mcp__supabase__generate_typescript_types`. Yeni RPC `get_price_changes` ve eklenmiş kolonlar generated tip'e yansımalı. **Önkoşul**: T003 + T004 + T005 + T006 (varsa).
- [X] T008 [P] Create `lib/format/percent.ts` — `formatTrPercent(value: number | null | undefined): string` per [data-model.md](./data-model.md) §3. Örnekler: `formatTrPercent(0.125)` → `"+%12,5"`, `formatTrPercent(-0.0825)` → `"-%8,25"`, `formatTrPercent(0)` → `"%0"`, `formatTrPercent(null)` → `"—"`.
- [X] T009 [P] Create `lib/constants/price-changes.ts` — export `DEFAULT_DAYS_WINDOW = 7`, `MAX_DAYS_WINDOW = 365`, `MIN_DAYS_WINDOW = 1`, `DAYS_PRESETS = [7, 14, 30, 90] as const`. Detay [data-model.md](./data-model.md) §4.
- [X] T010 [P] Create `lib/validations/price-changes-filter.ts` — `priceChangesFilterSchema` (zod: `days: z.coerce.number().int().min(1).max(365).optional()`, `showDrops: z.enum(["1","0"]).optional()`) + `parsePriceChangesFilter(sp)` + type `PriceChangesFilterState`. Invalid → `{ windowDays: 7, includeDrops: false }`. Detay [data-model.md](./data-model.md) §2.5.
- [X] T011 [P] Update `lib/routes.ts` — add `PRICE_CHANGES: "/dashboard/price-changes"` ve `PRODUCT_DETAIL: (id: string) => \`/dashboard/products/${id}\``. Detay [contracts/routes.md](./contracts/routes.md) §6.
- [X] T012 Create `lib/queries/price-changes.ts` — `listPriceChanges(filter)` Supabase RPC `get_price_changes` çağırır + `toPriceChangeRow` transform; export `PriceChangeRow` tipi. Detay [contracts/data-queries.md](./contracts/data-queries.md) §1. **Önkoşul**: T007 (RPC tip generated).
- [X] T013 Create `lib/queries/products.ts` — `getProductById(id)`, `listProductSnapshots(productId)` (JS pencere hesabı, R-008 kararı per [research.md](./research.md)), `listProductOrders(productId)`. Type'lar: `ProductSummary`, `ProductSnapshot`, `ProductOrderHistoryItem`. Detay [contracts/data-queries.md](./contracts/data-queries.md) §2-4. **Önkoşul**: T007.

**Checkpoint**: Foundational tamam — DB schema 006-aware, RPC çağrılabilir, format helper + zod hazır, data layer modülleri tip-safe. `npx tsc --noEmit` clean.

---

## Phase 3: User Story 1 — Zamlanan ürünler listesi (P1) 🎯 MVP

**Story goal**: `/dashboard/price-changes` ekranı son N gün içinde KDV dahil özel birim fiyatı yukarı çıkmış ürünleri tablo halinde gösterir; pencere genişliği + showDrops toggle URL search params ile yönetilir; "Siparişe git" cross-link aktif.

**Independent Test**: QS-04 — sentetik snapshot ile yapay zam tetikle → liste satırı görünür, eski/yeni/Δ doğru, "Siparişe git" link'i ESP0192194'e gider. QS-05 + QS-06 filter mantığını test eder.

**Dependencies**: Phase 2 tamam.

- [X] T014 [US1] Create `components/features/price-changes/window-filter.tsx` — **Client Component** (`"use client"`); props: `currentDays: number, currentShowDrops: boolean`. `<select>` (DAYS_PRESETS + "özel" preset URL'den) + `<input type="checkbox">` showDrops. `useRouter` + `useSearchParams` → `router.push(\`/dashboard/price-changes?...\`)`. useTransition UX için.
- [X] T015 [US1] Create `components/features/price-changes/price-change-row.tsx` — Server Component; props: `row: PriceChangeRow`. `<tr>` element; sütunlar: ürün kodu, ürün adı (link `/dashboard/products/<id>`), tedarikçi adı, eski fiyat (formatTry), yeni fiyat (formatTry), Δ% (formatTrPercent, +/- renkli), Δ₺ (formatTry, signed), "Siparişe git" link (lastOrderId varsa).
- [X] T016 [US1] Create `components/features/price-changes/price-change-table.tsx` — Server Component; props: `rows: PriceChangeRow[]`. Native `<table>` + Tailwind (rounded, sticky header). Boşsa `<PriceChangesEmptyState>` render eder. Sütun başlıkları: "Ürün Kodu / Ürün / Tedarikçi / Eski / Yeni / Δ% / Δ₺ / Sipariş".
- [X] T017 [US1] Create `components/features/price-changes/price-changes-empty-state.tsx` — Server Component; props: `hasAnySnapshot: boolean, windowDays: number`. Üç farklı mesaj (R-013 per [research.md](./research.md)): (a) hiç snapshot yok → komut hint; (b) tek snapshot → "yeterli geçmiş yok"; (c) 2+ snapshot ama bu pencerede değişiklik yok → "fiyat değişikliği yok".
- [X] T018 [US1] Create `app/(app)/dashboard/price-changes/page.tsx` — Server Component:
  - Async `searchParams: Promise<...>`
  - `parsePriceChangesFilter(await searchParams)` → `PriceChangesFilterState`
  - Header: "Zamlanan Ürünler" + window badge ("Son N gün")
  - `<WindowFilter>` render — currentDays, currentShowDrops
  - `listPriceChanges(filter)` çağır → rows
  - `<PriceChangeTable rows={rows}>` render
  - Metadata: `title: "Zamlanan Ürünler — Eker Ticaret"`
- [X] T019 [US1] Update `components/ui/top-bar.tsx` (001'den) — `<Link href={ROUTES.PRICE_CHANGES}>Zamlananlar</Link>` ekle; aktif sayfada `aria-current="page"` + visual indicator (`text-slate-900` bold). Detay [contracts/routes.md](./contracts/routes.md) §6.
- [X] T020 [US1] Run [quickstart.md](./quickstart.md) QS-03 (empty state) + QS-04 (yapay zam → satır görünür) + QS-05 (`?days=N` filter) + QS-06 (showDrops toggle). Fill QS-03 → QS-06 result tables.
- [X] T021 [US1] Run `npx tsc --noEmit` ve `npm run build`; clean kalmalı. `/dashboard/price-changes` First Load JS < 110 KB.

**Checkpoint**: US1 MVP done — manuel SQL ile snapshot eklenince zam listesi çalışır. US3 olmadan da bağımsız test edilebilir.

---

## Phase 4: User Story 2 — Ürün fiyat tarihçesi (P2)

**Story goal**: `/dashboard/products/[id]` ekranı ürün header + snapshot tarihçesi tablosu + sparkline + ürünün geçtiği siparişler. Cross-link sipariş detayından da çalışır (005 reviz).

**Independent Test**: QS-07 (detay sayfası render) + QS-08 (404) + QS-09 (sipariş detay → ürün detay cross-link).

**Dependencies**: Phase 2 tamam. US1 paralel olabilir (farklı dosyalar).

- [X] T022 [US2] Create `components/features/price-changes/product-header-card.tsx` — Server Component; props: `product: ProductSummary`. Render: ürün adı (h1), kodu (mono, küçük), marka, tedarikçi, KDV oranı (% format), mevcut KDV dahil fiyat (formatTry), son gözlem tarihi (formatTrDate); "← Zamlananlara dön" + "← Dashboard'a dön" linkleri.
- [X] T023 [US2] Create `components/features/price-changes/sparkline.tsx` — Server Component (SVG-only); props: `points: SparklinePoint[], width?=120, height?=32`. < 2 nokta → `<span>—</span>`. Native SVG `<polyline>` + min/max normalize; renk fiyat artıyorsa kırmızı, düşüyorsa yeşil. < 50 satır kod hedefi.
- [X] T024 [US2] Create `components/features/price-changes/product-history-table.tsx` — Server Component; props: `snapshots: ProductSnapshot[]`. Native `<table>`; sütunlar: tarih, KDV dahil fiyat, Δ önceki snapshot'a (% + ₺, ilk satırda "—"), KDV oranı (%), liste fiyatı (referans, küçük), iskonto metni (referans, küçük). DESC sıralı (en yeni başta).
- [X] T025 [US2] Create `components/features/price-changes/product-orders-list.tsx` — Server Component; props: `orders: ProductOrderHistoryItem[]`. `<ul>` veya `<table>` — her satır sipariş no (link `/dashboard/orders/<id>`), tarih (formatTrDate), adet × birim fiyat = line total (formatTry). Boşsa "Bu ürün henüz sipariş edilmemiş" mesajı.
- [X] T026 [US2] Create `app/(app)/dashboard/products/[id]/page.tsx` — Server Component:
  - Async `params: Promise<{ id: string }>`
  - `getProductById(id)` → null ise `notFound()`
  - `Promise.all([listProductSnapshots(id), listProductOrders(id)])`
  - Layout: `<ProductHeaderCard>` → `<Sparkline>` → `<ProductHistoryTable>` → `<ProductOrdersList>`
  - `generateMetadata`: `title: \`${product.name} — Eker Ticaret\`` (product fetch tekrar, V1 OK; V2 cache)
- [X] T027 [US2] Update `components/features/orders/order-detail-card.tsx` (005'ten) — item satırlarındaki `productCode` veya `productName`'i `<Link href={ROUTES.PRODUCT_DETAIL(productId)}>` ile sar. Önkoşul: `OrderDetailItem` tipinin `productId` field'ı olmalı; yoksa `lib/queries/orders.ts` içinde `getOrderDetail` query'sine `product_id` join eklenir (006-revize). Eğer `order_items.product_id` NULL ise sadece text render (link yok).
- [X] T028 [US2] Run [quickstart.md](./quickstart.md) QS-07 (ürün detayı render) + QS-08 (geçersiz UUID 404) + QS-09 (sipariş detay item link). Fill result tables.

**Checkpoint**: US2 done — ürün tarihçesi sayfası çalışır, cross-link sipariş ↔ ürün yönü tamamlandı.

---

## Phase 5: User Story 3 — Catalog scraper (P3)

**Story goal**: `npm run scrape:catalog -- --supplier enderyapi` komutu Enderyapı catalog'undan ürün başına Liste Fiyatı + İskonto + KDV'siz Net Fiyat + KDV oranını çeker; hesaplanan KDV dahil fiyatı `price_snapshots`'a yazar; ürün metadata'sını `products`'a upsert eder; `scrape_runs` audit yazılır.

**Independent Test**: QS-01 (tek ürün scrape, DB satır kontrolü) + QS-02 (5 ürün toplu < 3 dk).

**Dependencies**: Phase 2 tamam. US1/US2 bağımsız (farklı dosyalar) ama US3 sonrası gerçek verisi ile end-to-end UI test edilebilir.

- [X] T029 [US3] Extend `lib/scraper/types.ts` — `Adapter` interface'ine `scrapeCatalog(ctx, productCodes): Promise<CatalogScrapeResult[]>` method'u ekle. Yeni tip `CatalogScrapeResult` (productCode, productName?, brand?, listPrice?, discountText?, unitPriceExclVat?, vatRate?, unitPriceWithVat?, error?). Detay [contracts/catalog-scraper.md](./contracts/catalog-scraper.md) §1.
- [X] T030 [US3] Extend `lib/scraper/errors.ts` (veya `scripts/scrape/errors.ts`) — `FailureMode` enum'a ekle: `'catalog-parse-failed'`, `'product-not-found'`, `'vat-rate-missing'`. Detay §6.
- [X] T031 [US3] Implement `scrapeCatalog` in `lib/scraper/adapters/enderyapi.ts` — Catalog URL pattern'ını **headed mode** ile keşfet (`--product-code "118 049"` ile manuel deneme; QS-01'in ön ayarı). Parse: ürün adı (h1), marka, Liste Fiyatı, İskonto badge text, KDV'siz Net Fiyat, KDV oranı. Hesap: `unitPriceWithVat = Number((unitPriceExclVat * (1 + vatRate)).toFixed(2))`. Ürün başına bağımsız try/catch — bir hata diğerlerini durdurmasın. Detay [contracts/catalog-scraper.md](./contracts/catalog-scraper.md) §2.
- [X] T032 [US3] Extend `lib/scraper/supabase-writer.ts` — yeni iki fonksiyon:
  - `ensureProduct({ supplierSlug, code, productName?, brand?, vatRate? }): Promise<string>` — products UPSERT on (supplier_id, code); ad/marka/KDV oranı varsa UPDATE; productId döner. Yan etki: `order_items.product_id` IS NULL olan + aynı `product_code` eşleşen satırlar varsa back-fill (UPDATE `product_id` set).
  - `writePriceSnapshot({ productId, unitPriceWithVat, ... })`: INSERT `price_snapshots`.
- [X] T033 [US3] Create `scripts/scrape/catalog.ts` — CLI orchestrator. Args parse (`--supplier`, `--limit`, `--only-stale`, `--product-code`, `--headed`). Akış: `selectProductCodes` → `startRun(mode='catalog')` → `launchBrowser` → `adapter.login` → `adapter.scrapeCatalog` → per-result `ensureProduct` + `writePriceSnapshot` → `succeedRun`/`partialRun`/`failRun` → cleanup + stdout özeti. Detay [contracts/catalog-scraper.md](./contracts/catalog-scraper.md) §3.
- [X] T034 [US3] Update `package.json` — `"scripts.scrape:catalog": "tsx scripts/scrape/catalog.ts"`.
- [X] T035 [US3] Run [quickstart.md](./quickstart.md) QS-01 (tek ürün `--product-code "118 049"` ile scrape; DB'de yeni snapshot kontrolü). Fill result table.
- [X] T036 [US3] Run [quickstart.md](./quickstart.md) QS-02 (5 ürün `--limit 5` toplu scrape; < 3 dk hedefi, scrape_runs status). Fill result table.
- [X] T037 [US3] End-to-end: catalog scrape sonrası `/dashboard/price-changes` boş olabilir (tek snapshot/ürün). Manuel: birkaç saat aralıkla bir kez daha scrape veya sentetik delta ekle, gerçek `get_price_changes` çıktısını gözle. Bu T036'nın natural devamı; ayrı bir QS yok.

**Checkpoint**: US3 done — scraper aktif, DB'ye veri akıyor. US1 listesi gerçek verisiyle dolar.

---

## Phase 6: Polish & Cross-Cutting

- [X] T038 Run [quickstart.md](./quickstart.md) QS-10 (top bar nav "Zamlananlar" aktif state + a11y) + QS-11 (TR karakter render: İ, Ç, Ö ses). Fill result tables.
- [X] T039 Run [quickstart.md](./quickstart.md) QS-12 (performance: sentetik 100 ürün × 5 snapshot insert + `/dashboard/price-changes` <2sn + RPC <200ms). Fill result table. Sonra cleanup (TEST-% kayıtları sil).
- [X] T040 [P] Run `mcp__supabase__get_advisors({ type: "security" })` — yeni RLS warning yok (yeni RPC SECURITY INVOKER, yeni kolonlar mevcut policy kapsamında).
- [X] T041 [P] Run `mcp__supabase__get_advisors({ type: "performance" })` — yeni performance warning yok (`price_snapshots(product_id, observed_at DESC)` indeksi RPC için yeterli).
- [X] T042 Run `npm run build` (full production build) — Vercel deploy öncesi clean. `/dashboard/price-changes` ve `/dashboard/products/[id]` First Load JS < 115 KB.
- [X] T043 Manuel UI gözden geçirme: tüm metinler TR mi? Hiçbir İngilizce fallback var mı? (FR-022). Browser inspect ile çek.
- [X] T044 Append CHANGES log entry `CR-006 — Feature 006-price-changes-dashboard tamamlandı` to [.docs/CHANGES.md](../../.docs/CHANGES.md). Add new gotchas to [.docs/dev-gotchas.md](../../.docs/dev-gotchas.md) (örn. Enderyapı catalog DOM pattern, KDV'siz Net Fiyat parser, RPC tip generation).
- [X] T045 Fill final "Toplam doğrulama özeti" table at the bottom of [quickstart.md](./quickstart.md) — SC-001 → SC-009 against actual results.

---

## Dependencies & Story Completion Order

```
Setup (T001-T002)
  └── Foundational (T003-T013)  ← migrations + types + lib modules
        ├── US1 (T014-T021)     ← P1 MVP — manuel SQL ile test edilebilir
        ├── US2 (T022-T028)     ← P2 — bağımsız (T027 005 reviz)
        └── US3 (T029-T037)     ← P3 — catalog scraper
              └── Polish (T038-T045)
```

- **Foundational** her US için şart (migrations + types + lib modules + RPC).
- **US1, US2, US3 paralel yapılabilir** — farklı dosyalar. Ancak gerçek end-to-end veriyle US1 doğrulamak için US3 gerek (T037).
- **T020 QS-04** US1 doğrulamasını yapay snapshot SQL ile yapar — US3 olmadan test edilebilir.
- **T027** 005'in `OrderDetailCard`'ını revize eder — US2 dependency; ancak `order_items.product_id` doluluğuna bağlı (T002 → T006 → T032 backfill).
- **Polish** her şeyin sonunda.

## Parallel Execution Opportunities

Tasks marked `[P]`:
- **T003 + T004**: Foundational migrations, farklı dosya — paralel yazılabilir, sonra T005 RPC.
- **T008 + T009 + T010 + T011**: Foundational lib helpers, hepsi farklı dosya — paralel.
- **T040 + T041**: Bağımsız advisor scan'leri.

User Story bazlı paralel:
- **US1 (T014-T019) ↔ US2 (T022-T026)**: farklı klasörler, paralel yapılabilir.
- **US3 (T029-T034)**: farklı klasör (`lib/scraper`, `scripts/scrape`); US1+US2 ile paralel.

Sequential-only:
- T005 (RPC migration) → T007 (types regen) → T012, T013 (queries kullanır)
- T012 → T018 (page tüketir)
- T013 → T026 (page tüketir)
- T029 (interface) → T031 (impl) → T032 (writer) → T033 (orchestrator)

## Implementation Strategy

**MVP scope (recommended)**: T001 → T021 (Setup + Foundational + US1). Bu noktada `/dashboard/price-changes` çalışır; sentetik SQL ile zam listesi test edilebilir. Halil "feature'ın değeri ne olacak" sorusunu somut görür.

**Incremental delivery**:
1. **Aşama 1 — Schema + US1 MVP** (T001 → T021): ~2-3 saat. UI'da empty state + sentetik zam listesi.
2. **Aşama 2 — US3 catalog scraper** (T029 → T037): ~3-4 saat. Gerçek verisiyle US1 listesi dolu. Catalog DOM keşfi süre belirsizliği +1 saat olabilir.
3. **Aşama 3 — US2 ürün detay** (T022 → T028): ~2-3 saat. Tarihçe + sparkline + cross-link.
4. **Aşama 4 — Polish** (T038 → T045): ~1-1.5 saat.

**Total**: ~8-11 saat (spec'teki 8-12 saat tahminiyle uyumlu).

## Format Validation

All 45 tasks follow strict checklist format:
- ✅ Checkbox prefix `- [ ]`
- ✅ Task ID (T001-T045)
- ✅ `[P]` marker on parallel-safe tasks (T003, T004, T008, T009, T010, T011, T040, T041)
- ✅ `[US1]` / `[US2]` / `[US3]` story labels in Phase 3-5 only
- ✅ Exact file paths (`lib/format/percent.ts`, `app/(app)/dashboard/price-changes/page.tsx`, vb.)
