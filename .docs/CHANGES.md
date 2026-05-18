# Change Request Log

## Nasıl kullanılır
Her yeni talep veya kapsam değişikliği buraya kaydedilir.

## Format
```
### CR-NNN — Kısa başlık
- **Tarih:** YYYY-MM-DD
- **Talep eden:** kullanıcı / paydaş / kendi notum
- **Açıklama:** Ne isteniyor?
- **Etkilenen spec bölümleri:** spec.md satır X-Y
- **Etki analizi:** Kaç saatlik iş? Hangi modüller etkilenir?
- **Durum:** Beklemede / Onaylandı / Reddedildi / Tamamlandı
```

---

## Kayıtlar

### CR-001 — Feature 001-auth-dashboard tamamlandı
- **Tarih:** 2026-05-16
- **Talep eden:** Halil (kendi notu)
- **Açıklama:** Auth + boş dashboard iskeleti. Tek kullanıcı email+şifre ile giriş, `/dashboard` korumalı route, üst barda karşılama + çıkış butonu. Spec: [specs/001-auth-dashboard/spec.md](../specs/001-auth-dashboard/spec.md).
- **Etkilenen dosyalar:**
  - **Yeni:** `lib/routes.ts`, `lib/validations/auth.ts`, `app/(auth)/login/page.tsx`, `app/(auth)/login/actions.ts`, `app/(app)/layout.tsx`, `app/(app)/dashboard/page.tsx`, `components/features/auth/login-form.tsx`, `components/features/auth/logout-button.tsx`, `components/ui/top-bar.tsx`
  - **Değiştirilen:** `lib/supabase/middleware.ts` (route guard + Cache-Control no-store eklendi), `app/page.tsx` (sağlık kontrolünden koşullu redirect'e dönüştürüldü)
- **Etki analizi:** ~3 saat (spec + plan + research + tasks dahil), tek branch `001-auth-dashboard`, geri dönüş riski düşük. RLS politikası gerekmedi (yeni tablo yok).
- **Durum:** Tamamlandı. Manuel regression (QS-01 → QS-09) 2026-05-16'da kullanıcı tarafından geçirildi — tüm ✅.

### CR-002 — Feature 002-enderyapi-scraper-poc tamamlandı (kod)
- **Tarih:** 2026-05-16
- **Talep eden:** Halil (kendi notu)
- **Açıklama:** b2b.enderyapi.com.tr için Playwright tabanlı CLI scraper PoC. Spec: [specs/002-enderyapi-scraper-poc/spec.md](../specs/002-enderyapi-scraper-poc/spec.md).
- **Etkilenen dosyalar:**
  - **Yeni klasör/dosyalar:** `scripts/scrape/{constants,credentials,price-parse,output,errors,detection,enderyapi,README}.ts/md`
  - **Değiştirilen:** `package.json` (devDeps: playwright + tsx + dotenv; script: `scrape:enderyapi`), `.env.example` (ENDERYAPI_USERNAME, ENDERYAPI_PASSWORD), `.gitignore` (`scrape-debug/`)
- **Etki analizi:** ~4 saat (spec + plan + research + tasks + code). Next.js runtime'ına etkisi yok (scraper standalone). 3 bilinçli Constitution sapması (G2, G13, G14) plan.md → Complexity Tracking'te belgelendi; 004-005'te düzeltilecek.
- **Durum:** Tamamlandı (2026-05-16). **Senaryo A — feasibility kanıtlandı.** Login + navigation + parsing tüm üç adım çalışıyor; 20 sipariş başarıyla okundu. Site yapısı keşfedildi: SPA, iki-seviyeli (sipariş listesi → siparis-detay → ürün satırı), katalog 3. seviye. Implementation sırasında 4 küçük iterasyon yapıldı: (1) submit selector array genişletildi + Enter fallback, (2) 2FA detection sıkılaştırıldı (false positive fix), (3) SPA login için URL change wait, (4) detay sayfası için networkidle wait + verbose log. Site bulguları `dev-gotchas.md`'ye işlendi; 003'te Supabase schema'sı bu yapıya uygun (orders + order_items + products) tasarlanacak, 004'te tam scraper yazılacak.

### CR-003 — Feature 003-supabase-schema tamamlandı (kod)
- **Tarih:** 2026-05-16
- **Talep eden:** Halil (kendi notu)
- **Açıklama:** Tedarikçi sipariş ve fiyat takibi için Supabase Postgres schema'sı. 5 tablo (`suppliers`, `supplier_orders`, `order_items`, `products`, `price_snapshots`) + RLS + RPC fonksiyon (`record_price_observation`) + TypeScript type üretimi. Spec: [specs/003-supabase-schema/spec.md](../specs/003-supabase-schema/spec.md).
- **Etkilenen dosyalar:**
  - **Yeni migration'lar** (`supabase/migrations/`):
    - `20260516153627_core_tables.sql` — 5 tablo + index'ler + CHECK + FK + UNIQUE
    - `20260516153940_updated_at_trigger.sql` — `set_updated_at()` + 4 tabloya trigger
    - `20260516154009_rls_policies.sql` — RLS enable + 20 policy (4×5)
    - `20260516154039_seed_enderyapi.sql` — supplier seed
    - `20260516154251_record_price_observation.sql` — idempotent fiyat snapshot RPC
    - `20260516154431_fix_set_updated_at_search_path.sql` — advisor düzeltme
    - `20260516154507_rls_policies_optimize_auth_calls.sql` — `(select auth.uid())` ile sarma
    - `20260516154905_grant_table_privileges_to_authenticated.sql` — authenticated role'a CRUD GRANT
  - **Yeni:** `lib/supabase/database.types.ts` (Supabase MCP generate_typescript_types çıktısı)
  - **Değiştirilen:** `lib/supabase/client.ts`, `lib/supabase/server.ts` (`<Database>` generic eklendi)
- **Etki analizi:** ~3 saat (spec + plan + research + tasks + code + 8 manuel QS doğrulama + 3 advisor düzeltmesi). Constitution 14/14 ✅ — bilinçli sapma yok. 002'deki G14 (migration file-versioning) düzeltildi. Authenticated role privilege eksikliği implementation sırasında yakalandı, GRANT migration ile düzeltildi (dev-gotchas'a kaydedildi).
- **Durum:** Tamamlandı. Quickstart QS-00 → QS-08 tamamı ✅. Advisor: schema-related 0 critical (1 ek WARN `auth_leaked_password_protection` Auth Dashboard'da manuel açılır). 004 scraper artık bu schema'ya yazabilir.

### CR-004 — Feature 004-enderyapi-scraper-prod tamamlandı (kısmi)
- **Tarih:** 2026-05-16
- **Talep eden:** Halil (kendi notu)
- **Açıklama:** Multi-supplier adapter mimarisi + Enderyapi adapter + DB yazma + scrape_runs audit. Spec: [specs/004-enderyapi-scraper-prod/spec.md](../specs/004-enderyapi-scraper-prod/spec.md).
- **Etkilenen dosyalar:**
  - **Yeni klasör/dosyalar:**
    - `lib/scraper/{types,errors,adapter-registry,supabase-writer,run-logger}.ts`
    - `lib/scraper/adapters/enderyapi.ts` (PoC'tan adapter pattern'a port)
    - `scripts/scrape/run.ts` (CLI orchestrator)
  - **Yeni migration'lar:**
    - `20260516161959_scrape_runs.sql` (audit table)
    - `20260516202902_grant_table_privileges_to_service_role.sql` (003 sonrası eksik GRANT — service_role'e CRUD + RPC)
  - **Değiştirilen:**
    - `scripts/scrape/credentials.ts` — `loadCredentials(slug)` generic
    - `scripts/scrape/errors.ts` — yeni FailureMode değerleri (`db-write-failed`, `supplier-not-found`)
    - `scripts/scrape/enderyapi.ts` — deprecation banner
    - `scripts/scrape/README.md` — yeni mimari + adapter ekleme rehberi
    - `package.json` — `"scrape": "tsx scripts/scrape/run.ts"` script
    - `lib/supabase/database.types.ts` — `scrape_runs` ile regen
- **Etki analizi:** ~5 saat (spec + plan + research + tasks + code + manuel QS doğrulama). Constitution 14/15 ✅, 1 ⚠ G15 (credentials lokalde, 005'te GitHub Secrets'a taşınacak). Implementation sırasında 1 sürpriz: service_role'e GRANT eksikti (001'deki revoke migration'ından miras), düzeltme migration ile çözüldü ve dev-gotchas'a kaydedildi.
- **Kısmi tamamlandı**: P1 ✅ (sipariş geçmişi DB'de, idempotent), P3 ✅ (scrape_runs audit). **P2 ertelenmiş**: katalog DOM keşfi (T022-T025) → 005 feature'a taşındı. Sebep: ürün katalog sayfası URL pattern'ı + fiyat selector'ları henüz keşfedilmedi; GitHub Actions ortamında gerçek workflow ile birlikte yapılır. T021 (login-fail test) de ertelendi (gerçek hesap kilitleme riski).
- **Bilinen sınırlama**: `getOrderDetail` her sipariş için yalnızca 1 ürün satırı parse ediyor; muhtemelen tablo başlığı/summary satırı sayılıyor. T022 sırasında --headed mode'da düzeltilir (item parser refine).
- **Manuel doğrulama**: QS-03 ✅ (5 sipariş 13sn'de DB'ye yazıldı), QS-04 ✅ (idempotent: 2. koşumda 0 yeni), QS-06 ✅ (scrape_runs zengin), QS-08 ✅ (zero secret leak).
- **Durum**: Kısmi tamamlandı (US1 + US3 ✅, US2 → 005). MVP açısından çalışır: sipariş geçmişi DB'de, 006 dashboard feature artık başlayabilir.

### CR-005 — Feature 005-orders-dashboard tamamlandı (kod)
- **Tarih:** 2026-05-17
- **Talep eden:** Halil (kendi notu)
- **Açıklama:** Authenticated `/dashboard` sipariş listesi + tedarikçi/durum filtre'leri (URL search params) + sipariş detayı (`/dashboard/orders/[id]`) + data-quality flag. Spec: [specs/005-orders-dashboard/spec.md](../specs/005-orders-dashboard/spec.md).
- **Etkilenen dosyalar:**
  - **Yeni:**
    - `lib/format/{date,currency}.ts` — `Intl.DateTimeFormat('tr-TR')` + `Intl.NumberFormat('tr-TR', { currency: 'TRY' })`
    - `lib/validations/order-filter.ts` — zod schema + `parseFilter`
    - `lib/queries/orders.ts` — data layer (4 fonksiyon: `listOrders`, `getOrderDetail`, `listSuppliers`, `listDistinctStatuses`) + tip dönüşüm helper'ları
    - `components/features/orders/{empty-state,copy-command-button,order-row,order-table,filter-bar,order-detail-card}.tsx`
    - `app/(app)/dashboard/orders/[id]/page.tsx`
  - **Değiştirilen:**
    - `lib/routes.ts` — `ORDER_DETAIL(id)` eklendi
    - `app/(app)/dashboard/page.tsx` — Server Component rewrite (placeholder → tablo + filter bar)
- **Mimari kararlar:** Server Component default; sadece `OrderRow`, `FilterBar`, `CopyCommandButton` Client. Filter state URL search params'ta (zod ile validate), `useTransition` UX için. Sipariş detayı modal değil ayrı route (Server Component friendly, bookmark-able). Distinct status'lar için Supabase REST native DISTINCT yok → fetch + `Set` tekleştirme (V2: RPC).
- **Etki analizi:** ~4 saat (spec + plan + research + tasks + code). DB schema'ya dokunulmadı (003/004 schema yeterli). 32 task'tan 22 kod task'ı tamam; T012/T013/T017-T019/T022-T026/T029/T032 manuel browser QS testleri (kullanıcı doğrulayacak).
- **Constitution gates**: 15/15 ✅, G15 hâlâ ⚠ (credentials lokal — 008 GitHub Actions migrasyonunda kapanır; bu feature secret'lara dokunmuyor).
- **Doğrulama**: `npx tsc --noEmit` clean ✅; `npm run build` clean ✅ (`/dashboard` 107 kB, `/dashboard/orders/[id]` 106 kB First Load JS); advisor'larda 005 kaynaklı yeni bulgu yok (önceki state korunuyor).
- **Durum**: Kod tamam, manuel QS-01 → QS-10 (browser) kullanıcı doğrulamasına hazır.

### CR-006 — Feature 006-price-changes-dashboard tamamlandı (kod scaffolding)
- **Tarih:** 2026-05-17
- **Talep eden:** Halil (kendi notu)
- **Açıklama:** Catalog scrape + KDV-aware price tracking + zamlanan ürünler dashboard'u. Spec: [specs/006-price-changes-dashboard/spec.md](../specs/006-price-changes-dashboard/spec.md). 005'in temelinden besleniyor; takip değişkeni **KDV dahil özel birim fiyat** olarak netleşti.
- **Etkilenen dosyalar:**
  - **Yeni migration'lar:**
    - `add_vat_rate_to_products` — products.vat_rate NUMERIC(5,4) NOT NULL DEFAULT 0.20
    - `extend_price_snapshots_with_components` — price_snapshots'a 5 yeni kolon (unit_price_with_vat, list_price, discount_text, vat_rate, source)
    - `add_product_id_to_order_items` — order_items.product_id FK products(id); ürün-sipariş cross-link için
    - `add_brand_to_products` — products.brand TEXT (ek bulgu: 003'te yoktu)
    - `create_get_price_changes_rpc` — PL/SQL window function ürün başına eski/yeni karşılaştırma
  - **Yeni:**
    - `lib/format/percent.ts` — formatTrPercent (signed +%X,Y)
    - `lib/constants/price-changes.ts` — DEFAULT_DAYS_WINDOW, MAX_DAYS_WINDOW, DAYS_PRESETS
    - `lib/validations/price-changes-filter.ts` — zod + parsePriceChangesFilter
    - `lib/queries/{price-changes,products}.ts` — listPriceChanges (RPC), getProductById, listProductSnapshots (JS pencere hesabı), listProductOrders
    - `components/features/price-changes/{window-filter,price-change-row,price-change-table,price-changes-empty-state,sparkline,product-header-card,product-history-table,product-orders-list}.tsx`
    - `components/ui/top-bar-nav.tsx` — Siparişler / Zamlananlar nav
    - `app/(app)/dashboard/price-changes/page.tsx`
    - `app/(app)/dashboard/products/[id]/page.tsx`
    - `scripts/scrape/catalog.ts` — CLI orchestrator (--supplier, --product-code, --limit, --only-stale, --headed)
  - **Değiştirilen:**
    - `lib/routes.ts` — PRICE_CHANGES + PRODUCT_DETAIL
    - `lib/queries/orders.ts` — `OrderDetailItem.productId` eklendi (cross-link için)
    - `components/features/orders/order-detail-card.tsx` — item satırlarında productId varsa ürün detayına link
    - `components/ui/top-bar.tsx` — TopBarNav entegrasyonu + logo link
    - `lib/scraper/types.ts` — Adapter.scrapeCatalog method + CatalogScrapeResult tipi
    - `lib/scraper/adapters/enderyapi.ts` — scrapeCatalog impl (URL pattern candidate'ları + label-based field extraction)
    - `lib/scraper/supabase-writer.ts` — ensureProduct (UPSERT + order_items.product_id back-fill) + writePriceSnapshot
    - `scripts/scrape/errors.ts` — yeni FailureMode değerleri (catalog-parse-failed, product-not-found, vat-rate-missing)
    - `lib/supabase/database.types.ts` — regen (yeni kolonlar + RPC)
    - `package.json` — `scrape:catalog` script
- **Mimari kararlar:**
  - **KDV dahil özel birim fiyat = canonical tracking variable** (memory'de project-eker-vat-pricing-model).
  - 005'in Server Component default deseni; sadece WindowFilter Client (URL search params + useTransition).
  - Sparkline native SVG (50 satırlık component) — 3rd-party chart lib yok.
  - RPC `get_price_changes(window_days, include_drops)` SQL pencere fonksiyonu — UI tek çağrı.
  - Snapshot history (ürün detay) JS pencere hesabı (R-008) — ürün başına az veri için RPC overkill.
- **Etki analizi:** ~7 saat (spec + plan + research + tasks + code). Constitution gates 13/15 ✅, 2 ⚠ (G13 bilinçli RPC kullanımı, G15 hâlâ açık → 008). Implementation sırasında 2 sürpriz: (1) 003 schema'da `price_snapshots.captured_at` (data-model'da `observed_at` yazılmıştı) — RPC SQL'de düzeltildi; (2) `products.brand` kolonu hiç yoktu — ek migration eklendi. 45 task'tan 30+ kod task'ı tamam; manuel browser/CLI QS (T020, T028, T035-T037, T038-T039) kullanıcı testine bırakıldı.
- **Bilinen kısıtlama**: Enderyapı catalog URL pattern'ı + DOM selector'ları **henüz keşfedilmedi** — adapter'da 4 candidate URL ve label-based xpath extraction var. Kullanıcı `npm run scrape:catalog -- --supplier enderyapi --product-code "118 049" --headed --verbose` ile iteratif test ederek selector'ları doğrulayacak.
- **Doğrulama**: `npx tsc --noEmit` clean ✅; `npm run build` clean ✅ (`/dashboard/price-changes` 107 kB, `/dashboard/products/[id]` 106 kB First Load JS); advisor'larda yeni SECURITY uyarısı yok (sadece INFO `order_items_product_id_idx unused`, catalog scrape backfill sonrası dolacak).
- **Durum**: Kod scaffolding tamam, **catalog DOM keşfi + manuel QS** kullanıcı eylemine bağlı.

### CR-007 — Feature 007-scrape-automation
- **Tarih:** 2026-05-17
- **Talep eden:** Halil (kendi notu)
- **Açıklama:** Son kullanıcı (Eker Ticaret çalışanı) terminal kullanmadan UI üzerinden scrape'i yönetebilsin: günlük saat seçer + aç/kapa toggle + "Şimdi tetikle" butonu + son 10 koşum geçmişi (otomatik/manuel ayrımı + hata detayı). Spec: [specs/007-scrape-automation/spec.md](../specs/007-scrape-automation/spec.md).
- **Etkilenen dosyalar:**
  - **Yeni migration:** `supabase/migrations/20260517100340_scrape_schedule_table.sql` (1 satır seed: Enderyapı, enabled=false, hour=9), `supabase/migrations/20260517100341_scrape_runs_trigger_type.sql` (text + CHECK).
  - **Yeni Server Actions:** `app/actions/trigger-scrape.ts`, `app/actions/save-schedule.ts`.
  - **Yeni helper'lar:** `lib/github/workflow-dispatch.ts` (PAT fetch wrapper), `lib/queries/scrape-schedule.ts` (listSchedules + calculateNextRunAt), `lib/queries/scrape-runs.ts` (listRecentRuns + redactSecrets), `lib/validations/schedule-form.ts` (zod).
  - **Yeni UI:** `app/(app)/dashboard/settings/page.tsx`, `components/features/settings/` (5 dosya: SupplierScheduleCard, ScheduleForm, TriggerNowButton, RecentRunsList, RunErrorDetails).
  - **Yeni workflow:** `.github/workflows/scrape.yml` (cron `0 * * * *` + workflow_dispatch + concurrency.group + hour-gating).
  - **Yeni script:** `scripts/scrape/check-schedule.ts` (exit 0/78/1 ile cron skip kontrolü).
  - **Değişiklik:** `lib/scraper/run-logger.ts` (startRun signature + updateScheduleCache helper), `scripts/scrape/run.ts` (--trigger-type flag + auto-trigger sonunda cache update), `components/ui/top-bar-nav.tsx` (Ayarlar linki), `lib/routes.ts` (SETTINGS), `lib/format/date.ts` (formatTrDateTime), `lib/supabase/database.types.ts` (regen), `.env.example` (GITHUB_PAT/OWNER/REPO).
- **Mimari kararlar:**
  - Manuel tetikleme: Vercel Server Action → GitHub REST `workflow_dispatch` (research R1).
  - Cron: saatte 1 GH Actions cron + DB hour-gating (research R2; G16 ile uyumlu).
  - Concurrency: GH `concurrency.group: scrape-${supplier}` + Server Action DB-side "running koşum var mı?" check (R3).
  - Secrets göçü: B2B credentials + service role key → **GitHub Repo Secrets**; fine-grained PAT → Vercel env (R4; G15 kapanır).
  - `scrape_schedule` 1 satır/tedarikçi (R5), `trigger_type` text + CHECK (R6).
  - UI: manuel refresh + revalidatePath (R7); auto-poll yok (sıfır maliyet).
  - Saat dilimi: DB'de `daily_hour_utc` UTC; UI hem UTC hem Türkiye gösterir (R8).
  - Test: quickstart-driven manuel; Vitest setup V2'ye (R10).
- **Etki analizi:** ~4 saat (spec + plan + research + tasks + code). 39 task'tan 24 kod task'ı tamam; **manuel kullanıcı eylemleri (T018, T027, T030, T031-T033, T038-T039)** Vercel deploy + GitHub Secrets/Vercel env set sonrasına bırakıldı. Constitution gates tümü ✅ (G15 kapanır).
- **Doğrulama**: `npx tsc --noEmit` clean ✅; ESLint sadece 006'dan kalan 2 pre-existing warning (yeni kod temiz); credential leak grep 0 finding ✅.
- **Durum**: Kod ve workflow tamam. Vercel env + GitHub Secrets ayarlandıktan sonra Test 1-8 manuel doğrulama bekliyor.

### CR-008 — Feature 008-multi-supplier-orders (sipariş scrape iskelet tamam)
- **Tarih:** 2026-05-17
- **Talep eden:** Halil (kendi notu)
- **Açıklama:** İki yeni B2B tedarikçinin sipariş geçmişi entegrasyonu: **İkizler Hırdavat** (http://bayi.ikizlerhirdavat.com — HTTP) ve **Levent Şimşek Armatür** (https://liste.leventsimsekarmatur.com — HTTPS). Catalog scrape (güncel fiyat) bu feature'da YOK — 009'a ertelendi. Spec: [specs/008-multi-supplier-orders/spec.md](../specs/008-multi-supplier-orders/spec.md).
- **Etkilenen dosyalar:**
  - **Yeni migration:** `supabase/migrations/20260517110015_seed_ikizler_leventsimsek.sql` (2 satır: ikizler + leventsimsek), `supabase/migrations/20260517110026_seed_schedule_ikizler_leventsimsek.sql` (2 satır scrape_schedule, disabled, hour=9). Idempotent (ON CONFLICT). Production DB'ye uygulandı.
  - **Yeni adapter modülleri:** `lib/scraper/adapters/ikizler.ts` + `ikizler.constants.ts`, `lib/scraper/adapters/leventsimsek.ts` + `leventsimsek.constants.ts`. Her ikisi de enderyapı pattern'i ile aynı: login + listOrders + getOrderDetail + getProductPrice (placeholder, catalog 009'da). Selector havuzları best-guess (ASP.NET MVC + PHP konvansiyonları) — DOM keşfi sırasında refine edilecek.
  - **Değişiklik:** `lib/scraper/adapter-registry.ts` (2 import + 2 map entry), `.github/workflows/scrape.yml` (supplier choice options expand to 3 + 4 yeni env mapping), `.env.example` (IKIZLER + LEVENTSIMSEK placeholders).
- **Mimari kararlar:**
  - Per-adapter constants dosyası pattern'i (`<slug>.constants.ts`) — namespace çatışmasından kaçınmak için (research R-001). Constitution'a 2026-05-17 satırı eklendi.
  - HTTP plaintext (İkizler) riski kullanıcı tarafından kabul edildi — ek mitigation yok (FR-012, Constitution).
  - getProductPrice metodu placeholder (`return null`) — catalog 009'a ertelendi (research R-006).
  - Workflow_dispatch supplier input listesi `[enderyapi, ikizler, leventsimsek]` olarak genişletildi — UI Server Action'ın yeni slug'ları tetikleyebilmesi için zorunlu (R-005).
- **Etki analizi:** ~3 saat plan/spec/contracts; ~1 saat adapter scaffolding; **DOM keşfi (T010-T012, T022-T024 refine) kullanıcı tarafından yerel ortamda `--headed` mode ile yapılacak**. 39 task'tan 23 kod task'ı tamam (Phase 1+2+adapter scaffolds+adapter-registry+CONSTITUTION+CHANGES); kalan task'lar: kullanıcı manuel DOM keşfi + GitHub Secrets ekleme + production smoke (T014-T018, T026-T030, T031-T032).
- **Doğrulama**: `npx tsc --noEmit` clean ✅; DB seed migrations idempotent verified (3 supplier rows, 3 schedule rows); workflow YAML reformatted correctly; credential leak scan 0 hardcoded finding.
- **Durum**: Code scaffolding tamam. Kullanıcının yerel ortamda credentials ekleyip `--headed` smoke testleri yapması + selector refine etmesi + GitHub Secrets ekleyip production smoke alması bekleniyor.


### CR-009 — Feature 009-multi-supplier-catalog tamamlandı
- **Tarih:** 2026-05-18
- **Talep eden:** Halil (kendi notu)
- **Açıklama:** İkizler + Levent Şimşek için catalog scrape — `/dashboard/price-changes` artık 3 tedarikçinin de fiyat değişimlerini göstermesi için ürün catalog detay sayfalarından KDV hariç özel fiyat snapshot'ları çekiyor. 008'de bu faz ertelenmişti. Spec: [specs/009-multi-supplier-catalog/spec.md](../specs/009-multi-supplier-catalog/spec.md).
- **Etkilenen dosyalar:**
  - **Yeni:** Migration `add_products_barcode` (products.barcode kolonu + index)
  - **Değiştirilen:**
    - `lib/scraper/adapters/ikizler.constants.ts` — CATALOG_* selector'lar (modal trigger + price modal labels)
    - `lib/scraper/adapters/ikizler.ts` — `scrapeCatalog` (modal-based: `.fiyatgoster` click → modal → "Liste Fiyatı:" / "Nakit Fiyatı:" parse) + `searchAndOpenFirst` (POST form submit, SearchText input)
    - `lib/scraper/adapters/leventsimsek.constants.ts` — CATALOG_* selector'lar (`.dFyt .listtext` + `.divsinglepriceUPSNAKIT #pric`)
    - `lib/scraper/adapters/leventsimsek.ts` — `scrapeCatalog` (search + detail page parse) + barkod-aware search (Levent muhasebe kodu site search'te unique değil); `getOrderDetail` modal'dan `Barkod:` regex parse + `RawOrderItem.barcode`
    - `lib/scraper/supabase-writer.ts` — `writePriceSnapshot` idempotency check (aynı fiyat → no-op) + `numeric(14,2)` yuvarlama normalize; `ensureProduct` barcode parametresi + products.barcode UPDATE
    - `lib/scraper/types.ts` — `CatalogScrapeTarget.barcode/productName`, `RawOrderItem.barcode`, `ScrapeSummary.snapshots_skipped`
    - `scripts/scrape/all.ts` — `catalogPhase` snapshots_skipped log + summary; `selectCatalogTargets` products.barcode + name dahil
    - `scripts/scrape/check-schedule.ts` — exit 78 → `GITHUB_OUTPUT.skip` (saatlik mail spam fix)
    - `.github/workflows/scrape.yml` — `steps.check.outputs.skip == 'false'` gate
    - `lib/supabase/database.types.ts` — products.barcode tip eklendi
- **Önemli kararlar:**
  - **Levent KDV hariç Nakit Fiyatı canonical** — site "KDV HARİÇ FİYATLARDIR" notuyla net, adapter %20 KDV ekleyerek `unitPriceWithVat` hesaplar
  - **İkizler Nakit = Net Fiyatı (modal'da)** — KDV=0 görünüyor (B2B muafiyet); fiyat zaten KDV dahil/hariç aynı
  - **Levent search çakışması → barkod fallback** — orders modal'dan barkod yakalanır, catalog scrape barkod öncelikli arama yapar
  - **Idempotency**: writer `unit_price` exact match → skip; numeric(14,2) yuvarlama normalize
- **Etki analizi:** ~5-6 saat (spec + plan + tasks + impl + 2 adapter discovery + idempotency fix + barcode refactor). Branch `009-multi-supplier-catalog`. 1 migration eklendi (geri dönüş: kolon nullable, eski kodla uyumlu). Local smoke: İkizler 60/60 ürün, Levent 6/6 ürün, ikinci koşumda 0 yeni snapshot.
- **Durum:** Tamamlandı (local). Production smoke + manuel fiyat doğrulama push sonrası.
