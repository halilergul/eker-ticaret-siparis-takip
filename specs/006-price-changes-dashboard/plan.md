# Implementation Plan: Fiyat Fark Dashboard'u (Catalog Scraping + Alarm UI)

**Branch**: `006-price-changes-dashboard` | **Date**: 2026-05-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-price-changes-dashboard/spec.md`

## Summary

US1 (P1 MVP): `/dashboard/price-changes` — son N gün içinde **KDV dahil özel birim fiyatı yukarı çıkmış** ürünleri liste. Eski/yeni fiyat, %/₺ fark, son siparişe link. US2 (P2): `/dashboard/products/[id]` — ürün fiyat tarihçesi (tablo + sparkline) + ürünün geçtiği siparişler. US3 (P3): `npm run scrape:catalog -- --supplier enderyapi` — 004 adapter mimarisini genişleterek catalog detay sayfalarından Liste Fiyatı + İskonto + KDV'siz Net Fiyat + KDV oranı çek; hesaplanan KDV dahil fiyatı `price_snapshots`'a yaz.

**Teknik yaklaşım**: 004 adapter pattern'ı yeniden kullan (`Adapter` interface'e `scrapeCatalog(productCodes)` ekle); 003 schema'yı `products.vat_rate` + `price_snapshots`'a ham parçalar (KDV oranı, KDV hariç fiyat, liste fiyatı, iskonto metni) ekleyen migration ile genişlet. 005 deseni (Server Components default, URL search params for filter state, native Intl formatting, RLS-respecting authenticated client) UI tarafında aynen reuse. Fiyat fark hesabı SQL pencere fonksiyonu (`LAG()`) ile snapshot başına gerçekleştirilir; UI hesaba sokmaz. Sparkline tek bir basit SVG component ile native (3rd-party chart lib yok).

## Technical Context

**Language/Version**: TypeScript 5.x (strict, `noUncheckedIndexedAccess`)
**Primary Dependencies** (yeni eklenmiyor):
- Frontend: Next.js 15.5 (App Router, RSC, Server Actions), React 19, Tailwind v4, `@supabase/ssr` (createBrowserClient/createServerClient with `<Database>` generic), zod
- Backend: Supabase Postgres, RLS, RPC (PL/pgSQL) — `record_price_observation` (003'te var, reuse edilir)
- Scraper: Playwright (Chromium) — 004'ten gelir; `tsx` TS runner
**Storage**: Supabase Postgres (single project, free tier)
- 003 tabloları: `suppliers`, `supplier_orders`, `order_items`, `products`, `price_snapshots`
- 004 tablosu: `scrape_runs` (audit; reuse)
- Bu feature'da değişen: `products` (+ `vat_rate`), `price_snapshots` (+ `unit_price_with_vat`, `list_price`, `discount_text`, `source`)
**Testing**: Manuel doğrulama [quickstart.md](./quickstart.md) (QS-00 → QS-12); Vitest opsiyonel
**Target Platform**: Web (Vercel Edge'a uyumlu Server Components); scraper macOS dev / Linux GitHub Actions runner
**Project Type**: Web app (Next.js full-stack) + Node CLI (scraper)
**Performance Goals**:
- `/dashboard/price-changes` ilk yükleme < 2sn (100 ürün × 20 snapshot veri kümesinde)
- Catalog scrape: 20 ürün < 3 dk, 50 ürün < 8 dk (network normalse)
- Sparkline render < 50ms (tek SVG, 20 nokta tipik)
**Constraints**:
- Sıfır maliyet: tüm bileşenler free tier'da kalır
- Tek kullanıcı: çoklu kullanıcı/RBAC yok
- Tek tedarikçi MVP: sadece Enderyapı
- Tüm UI metni TR; TR locale (formatTry, formatTrDate 005'ten reuse)
- TR karakter (İ, ı, ş, ğ, ç, ö, ü) collation + render
- API key/secret kaynak koda girmez (`.env.local` gitignored)
- `SUPABASE_SERVICE_ROLE_KEY` sadece scraper server-side
- `ENDERYAPI_USERNAME/PASSWORD` log/stdout/screenshot/error_message dışında
- RLS her yeni kolon/policy için zorunlu
**Scale/Scope**:
- Şu an: 5 sipariş, 5 ürün, 0 catalog snapshot
- 6 ay sonra: ~500 sipariş, ~200 ürün, ~10k snapshot (200 ürün × günlük 50 hafta)
- 1 yıl: 1k-2k sipariş, 500 ürün, ~80k snapshot — hâlâ Supabase free tier kapasitesinde

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Gate | Karar | Not |
|---|------|-------|-----|
| G1 | Sıfır maliyet (free tier) | ✅ PASS | Supabase free; chart için yeni paket gelmiyor (SVG native); scraper Playwright var |
| G2 | Tek kullanıcı | ✅ PASS | Yeni rol/permission yok |
| G3 | TR dil + karakter | ✅ PASS | Tüm UI metin TR; SQL ORDER BY `localeCompare("tr")` reuse |
| G4 | V1 anti-goal: mobil yok | ✅ PASS | Web only |
| G5 | API key kaynak kodda yok | ✅ PASS | Env vars + GitHub Secrets (cron 008'de) |
| G6 | Service-role sadece server-side | ✅ PASS | Scraper service_role kullanır; UI authenticated client |
| G7 | RLS her tablo + kolon | ✅ PASS | products + price_snapshots'ta mevcut policy (003), ek kolonlar otomatik kapsam dahilinde |
| G8 | B2B kimlik bilgisi loglara sızmaz | ✅ PASS | 004 desenini koru — credentials env'den okunur, scrape_runs.summary/error_message'a yazılmaz |
| G9 | Server Component default | ✅ PASS | Tüm yeni page'ler RSC; Client island sadece sparkline interaktivitesi (varsa) |
| G10 | Naming convention | ✅ PASS | kebab-case file, camelCase fn, PascalCase component |
| G11 | Magic number yok | ✅ PASS | `DEFAULT_DAYS_WINDOW = 7`, `MAX_DAYS_WINDOW = 365` sabitler `lib/constants/price-changes.ts` |
| G12 | zod boundary validation | ✅ PASS | URL search params (?days=N) zod ile parse; scraper CLI args |
| G13 | RPC kullan, raw SQL kaçın | ⚠ KISMI | Fiyat fark karşılaştırması için bir RPC fonksiyonu (`get_price_changes(window_days)`) yazılır — performans + SQL temiz; UI tarafında raw SQL yok |
| G14 | Migration `supabase migration new` | ✅ PASS | İki migration: `add_vat_rate_to_products`, `extend_price_snapshots` |
| G15 | Credentials GitHub Secrets | ⚠ HÂLÂ AÇIK | Şu an lokal .env'de; 008'de GitHub Actions cron ile birlikte taşınacak. Bu feature secret'lara dokunmuyor |

**Sonuç**: 13/15 ✅, 2 ⚠ (G13 = bilinçli karar — RPC daha temiz + idempotent; G15 = pre-existing, 008'e ait). Plan ilerleyebilir.

## Project Structure

### Documentation (this feature)

```text
specs/006-price-changes-dashboard/
├── plan.md              # bu dosya
├── spec.md              # /speckit-specify (zaten yazıldı)
├── research.md          # Faz 0 (bu komut)
├── data-model.md        # Faz 1 (bu komut)
├── quickstart.md        # Faz 1 (bu komut)
├── contracts/           # Faz 1 (bu komut)
│   ├── data-queries.md
│   ├── routes.md
│   └── catalog-scraper.md
└── tasks.md             # /speckit-tasks sonra yazacak
```

### Source Code (repository root)

```text
app/
  (app)/
    dashboard/
      page.tsx                          # mevcut (005)
      orders/[id]/page.tsx              # mevcut (005)
      price-changes/page.tsx            # YENİ — US1 P1 MVP
      products/[id]/page.tsx            # YENİ — US2 P2

components/
  features/
    orders/                             # mevcut (005)
    price-changes/                      # YENİ feature klasörü
      price-change-row.tsx              # Client (link davranışı)
      price-change-table.tsx            # Server
      price-changes-empty-state.tsx     # Server
      window-filter.tsx                 # Client (days dropdown + showDrops toggle)
      sparkline.tsx                     # Server (SVG-only)
      product-history-table.tsx         # Server
      product-orders-list.tsx           # Server
      product-header-card.tsx           # Server

lib/
  queries/
    orders.ts                           # mevcut (005)
    price-changes.ts                    # YENİ — listPriceChanges, getProductDetail
    products.ts                         # YENİ — getProductById, listProductSnapshots, listProductOrders
  validations/
    order-filter.ts                     # mevcut (005)
    price-changes-filter.ts             # YENİ — window days + showDrops zod
  format/
    date.ts                             # mevcut (005)
    currency.ts                         # mevcut (005)
    percent.ts                          # YENİ — formatTrPercent(0.125) → "+%12,5"
  constants/
    price-changes.ts                    # YENİ — DEFAULT_DAYS_WINDOW, MAX_DAYS_WINDOW
  scraper/
    types.ts                            # mevcut — Adapter'a `scrapeCatalog` eklenir
    adapter-registry.ts                 # mevcut
    supabase-writer.ts                  # mevcut — writePriceSnapshot eklenir
    run-logger.ts                       # mevcut — partialRun reuse
    adapters/
      enderyapi.ts                      # mevcut — `scrapeCatalog(productCodes)` eklenir

lib/routes.ts                           # mevcut — PRICE_CHANGES, PRODUCT_DETAIL eklenir

scripts/scrape/
  run.ts                                # mevcut — `--catalog` flag eklenir (mode: orders | catalog)
  catalog.ts                            # YENİ — catalog scrape orchestrator (run.ts'tan ayrı)

supabase/migrations/
  20260517XXXXXX_add_vat_rate_to_products.sql                   # YENİ
  20260517XXXXXX_extend_price_snapshots_with_components.sql     # YENİ
  20260517XXXXXX_create_get_price_changes_rpc.sql               # YENİ — RPC fonksiyonu

package.json                            # mevcut — `"scrape:catalog": "tsx scripts/scrape/catalog.ts"`
```

**Structure Decision**: Mevcut 005 dizin desenini (`lib/queries/<entity>.ts`, `components/features/<feature>/*.tsx`, `app/(app)/dashboard/<page>/page.tsx`) genişletiyoruz. Scraper tarafında 004'ün `Adapter` interface'ine yeni method (`scrapeCatalog`) eklenir; ayrı orchestrator dosyası (`scripts/scrape/catalog.ts`) order scraper'dan koddiziniyle ayrı tutulur ki run.ts şişmesin. SQL fiyat-fark hesabı için bir RPC fonksiyonu — frontend basit kalır, performans optimal (Postgres `LAG()` pencere fonksiyonu).

## Complexity Tracking

| Violation / Sapma | Why Needed | Simpler Alternative Rejected Because |
|-------------------|------------|--------------------------------------|
| Yeni RPC fonksiyonu (`get_price_changes`) | Snapshot listesinde her ürün için "son N gün içinde fiyat değişimi" hesabı pencere fonksiyonuyla SQL'de yapılır; UI tarafında JS ile yapmak (1) tüm snapshot'ları çekmeyi (büyük transfer) (2) JS'te tek ürün başına gruplama + LAG simülasyonunu gerektirir. SQL native + idempotent. | SQL'i `lib/queries`'te raw query olarak yazmak G13'e ters; RPC kapsüllendiğinde SECURITY INVOKER ile RLS otomatik dahil |
| `price_snapshots`'a ek 4 kolon | Audit + değişiklik nedeni tespiti (KDV oranı değişti mi, iskonto mu değişti mi, liste fiyatı mı?) ileride gereksin | Sadece `unit_price_with_vat` tek kolon yazmak basit ama "değişiklik nedeni" sorusunu cevaplayamaz; audit'siz fiyat tarihi B2B alış kararını destekleyemez |
| Custom sparkline (3rd-party chart lib yok) | Tek SVG component (<50 satır); recharts/chart.js bundle'a 50-100kB ekler; tek kullanıcı performansı için ağır | Recharts esnek ama overkill; native SVG 20 nokta için yeterli |

Sapmalar küçük + gerekçeli; gate'ler hâlâ pass.
