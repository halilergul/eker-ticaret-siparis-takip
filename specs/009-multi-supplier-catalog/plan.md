# Implementation Plan: İkizler + Levent Şimşek catalog scrape (zamlanan ürünler genişlemesi)

**Branch**: `009-multi-supplier-catalog` | **Date**: 2026-05-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/009-multi-supplier-catalog/spec.md`

## Summary

İki yeni adapter için `scrapeCatalog` metodu implement edilir (`lib/scraper/adapters/ikizler.ts` ve `leventsimsek.ts`). Mevcut adapter interface'in **opsiyonel** metodu (`types.ts:77-80`) zaten orchestrator (`scripts/scrape/all.ts:221-300`) tarafından çağrılıyor — adapter'da bu metod tanımlandığı an, catalog fazı otomatik koşar. Snapshot write yolu (`writePriceSnapshot`), failure mode taxonomy, summary kolonları (`snapshots_added`, `products_observed`), `catalog_url` cache, search→direct cache hit/miss pattern'i — hepsi 006 ile kurulmuş; bu feature'da **dokunulmaz**.

Per-adapter iş: her site için (1) catalog detay URL pattern keşfi, (2) ürün koduyla **navigate (cached `catalogUrl`) veya search** fallback'i, (3) Liste Fiyatı / KDV hariç Net Fiyat / KDV oranı / iskonto metni alanlarının CSS class/id-tabanlı parse'ı. Opsiyonel ikinci pas: `getOrderDetail` içinde her order_item için ürünün catalog detay URL'sini yakalayıp `RawOrderItem.catalogUrl` alanına yazmak — sonraki catalog koşumlarında search bypass edilir (Enderyapı `enderyapi.ts:525-555` ile aynı pattern).

Teknik yaklaşım: 008'deki iteratif DOM keşfi pattern'i (diag script → constants → quickstart smoke → constants iterate) tekrarlanır. CSS class/id-tabanlı selector zorunlu (Unicode apostrof riski; 006 deneyimi). KDV oranı catalog sayfasında parse edilemezse default %20 fallback (Enderyapı kararı ile uyumlu; FR-004 + spec edge case). Catalog scrape başarısızlığı orders'ı engellemez — orchestrator zaten ayrı faz olarak izole ediyor (`scripts/scrape/all.ts:354 vs 349`).

## Technical Context

**Language/Version**: TypeScript 5.x (strict, `noUncheckedIndexedAccess`), Node.js 22, React 19, Next.js 15 (App Router)

**Primary Dependencies**: Playwright (Chromium, GitHub Actions runner üzerinde), `@supabase/ssr`, `@supabase/supabase-js`, `dotenv`, `zod` — **yeni paket eklenmez**

**Storage**: PostgreSQL (Supabase managed). Mevcut tablolar:
- `products` — `code`, `last_seen_at`, `catalog_url`, `vat_rate` (006 migration'ı genişletti)
- `price_snapshots` — `product_id`, `captured_at`, `unit_price_with_vat`, `unit_price_excl_vat`, `vat_rate`, `list_price`, `discount_text`, `source`
- `scrape_runs` — `summary` JSONB (`snapshots_added`, `products_observed` alanlarını içerir)
- `scrape_schedule` — 008'de İkizler + Levent için satırlar mevcut

**Yeni tablo, RLS, RPC YOK**.

**Testing**: Manuel quickstart smoke (`npm run scrape:all -- --supplier <slug>` catalog phase dahil). Birim/entegrasyon test V1 kapsamında değil (008 + 006 precedent). Selector regresyonu manuel `scrape-debug/<runId>/*.png` ile yakalanır.

**Target Platform**: Vercel Hobby (Next.js UI) + GitHub Actions `ubuntu-latest` runner (Playwright catalog scrape). Per-supplier `concurrency.group: scrape-${supplier}` izolasyonu zaten kurulu (008).

**Project Type**: Web fullstack (Next.js App Router monorepo).

**Performance Goals**:
- Per-supplier catalog scrape **≤ 10 dakika** (5–25 ürün × ~10 sn/ürün; workflow `timeout-minutes: 15`, orchestrator iç `TIMEOUT_OVERRIDE_MS` halihazırda kurulu).
- İkinci ve sonraki koşumlarda `catalog_url` cache sayesinde search atlanır → ürün başına ~3-5 sn.
- Idempotency: aynı gün/aynı fiyat → snapshot eklenmez (RPC `record_price_observation` 003'ten zaten idempotent).

**Constraints**:
- **Sıfır maliyet** — GitHub Actions free tier (2000 dk/ay). 3 tedarikçi × günlük 1 tetik × (orders 5 dk + catalog 5 dk) ≈ 30 dk/gün ≈ 900 dk/ay ≤ %45 kota.
- **Tek kullanıcı** — yeni RLS yok; mevcut authenticated policy'leri `price_snapshots`'a 003'ten itibaren uygulanıyor.
- **Kaynak kodda kimlik bilgisi yok** — `IKIZLER_*`, `LEVENTSIMSEK_*` env değerleri 008'de zaten kuruldu; yeni secret eklenmez.
- **İkizler HTTP** — 008'de kabul edilen risk; mitigation yok (Constitution kaydı 2026-05-17).
- **CORS** — server-side Playwright; tarayıcıdan direkt fetch yok.

**Scale/Scope**:
- 2 adapter dosyasında (`ikizler.ts`, `leventsimsek.ts`) `scrapeCatalog` metodu eklenir (~150-250 satır/adapter ekleme).
- 2 adapter constants dosyasında (`<slug>.constants.ts`) catalog selector'ları + URL pattern'leri eklenir (~50-80 satır/adapter ekleme).
- **0 yeni migration**, **0 yeni UI bileşeni**, **0 yeni query/route**.
- Bu feature 008'den genişler — UI ve query katmanı zero-touch.

## Constitution Check

*GATE: Pass before Phase 0; re-check after Phase 1.*

| Gate | Status | Notes |
|------|--------|-------|
| **Sıfır maliyet** | ✅ PASS | 2000 dk/ay free tier'da rahat sığar; yeni servis veya paket yok. |
| **Tek kullanıcı / RLS** | ✅ PASS | Yeni tablo yok → yeni RLS yok. Mevcut `price_snapshots` authenticated policy'leri yeterli (003). |
| **Secrets disiplini** | ✅ PASS | 008'de eklenen `IKIZLER_*` + `LEVENTSIMSEK_*` secret'ları reuse; yeni secret yok. |
| **Adapter mimari** | ✅ PASS | `scrapeCatalog` adapter interface'in opsiyonel metodu; sadece İkizler + Levent adapter'larına eklenir. |
| **Per-adapter constants pattern** | ✅ PASS | 008'de kurulan pattern (`<slug>.constants.ts`) catalog selector'ları için genişletilir. |
| **Türkçe karakter / i18n** | ✅ PASS | CSS class-tabanlı arama zorunlu (Unicode apostrof riski). Ürün adı TR karakter desteği `price_snapshots`/`products` text alanlarında zaten korunuyor. |
| **Site DOM kırılma noktası** | ⚠ ACCEPT | Selector kırılırsa catalog fazı `Başarısız` (`catalog-parse-failed`, `vat-rate-missing`, `product-not-found` mode'ları), orders fazı bağımsız tamamlanır (FR-007). Manuel adapter güncellemesi gelecek minor work. |
| **HTTP plaintext (İkizler)** | ⚠ ACCEPT | 008'de kabul edildi; aynı koşul catalog fazında da geçerli. Constitution güncel. |
| **Catalog scope = bilinen ürünler** | ✅ PASS | Orchestrator `products` tablosunu queryliyor (`scripts/scrape/all.ts:130-135`); 006/Enderyapı kuralı korundu. Cold catalog crawl V2+. |
| **KDV default %20 fallback** | ✅ PASS | Enderyapı kararı; heterojen oran parse edilebilirse adapter `vatRate` alanını doldurur, yoksa `vat-rate-missing` mode → 006'da bu durumda snapshot eklenmiyor ama default kabul edilirse adapter %20 ile gönderir (adapter kararı). |
| **Adapter `scrapeCatalog` opsiyonel** | ✅ PASS | Interface'te `?` ile işaretli (`types.ts:77`); diğer adapter'lar (Enderyapı'nın mevcut implementasyonu) etkilenmez. |
| **Catalog hata izolasyonu (orders'ı engellemez)** | ✅ PASS | Orchestrator 006'da zaten ayrı izole ediyor (`scripts/scrape/all.ts:354 vs 349`); `try/catch` blokları catalog phase için ayrı (FR-007). |

**Tüm gate'ler PASS veya yazılı ACCEPT** — Phase 0 araştırmasına geçilebilir. Yeni Complexity Tracking gerekli değil.

## Project Structure

### Documentation (this feature)

```text
specs/009-multi-supplier-catalog/
├── plan.md              # Bu dosya
├── spec.md              # /speckit-specify çıktısı (var)
├── research.md          # Phase 0 çıktısı
├── data-model.md        # Phase 1 çıktısı (no-op; mevcut şema kullanılır)
├── quickstart.md        # Phase 1 çıktısı
├── contracts/
│   ├── adapter-catalog-contract.md          # scrapeCatalog metodu için input/output sözleşmesi
│   ├── ikizler-catalog-discovery.md         # İkizler catalog DOM keşif rehberi
│   └── leventsimsek-catalog-discovery.md    # Levent Şimşek catalog DOM keşif rehberi
├── checklists/
│   └── requirements.md  # /speckit-specify çıktısı (var)
└── tasks.md             # /speckit-tasks çıktısı (sonraki adım)
```

### Source Code (repository root)

```text
lib/
├── scraper/
│   ├── types.ts                            # değişmez (Adapter.scrapeCatalog opsiyonel zaten tanımlı)
│   ├── adapter-registry.ts                 # değişmez (008'de eklendi)
│   ├── adapters/
│   │   ├── enderyapi.ts                    # DEĞİŞMEZ (referans — scrapeCatalog mevcut)
│   │   ├── ikizler.ts                      # GÜNCELLENİR — scrapeCatalog metodu eklenir; getOrderDetail opsiyonel olarak catalogUrl yakalar
│   │   ├── ikizler.constants.ts            # GÜNCELLENİR — CATALOG_* selector'ları + URL pattern'leri
│   │   ├── leventsimsek.ts                 # GÜNCELLENİR — scrapeCatalog metodu; getOrderDetail catalogUrl yakalama
│   │   └── leventsimsek.constants.ts       # GÜNCELLENİR — CATALOG_* selector'ları
│   ├── supabase-writer.ts                  # değişmez (writePriceSnapshot reuse)
│   ├── run-logger.ts                       # değişmez
│   └── errors.ts                           # değişmez (mevcut failure mode taxonomy yeterli)

scripts/
└── scrape/
    ├── all.ts                              # değişmez (catalog phase 006'dan kalan; adapter-driven)
    ├── catalog.ts                          # değişmez (standalone catalog komutu — debug için)
    └── ...                                 # diğer dosyalar değişmez

supabase/migrations/                        # YENİ MIGRATION YOK

.env.example                                # değişmez (008'de İkizler + Levent placeholder'ları zaten var)

.github/workflows/scrape.yml                # değişmez (008'de supplier choice options + env mapping kuruldu)
```

**Structure Decision**: Web fullstack (Next.js App Router monorepo). Tüm değişiklik `lib/scraper/adapters/` altında 4 dosyaya kapalı. UI/query/route/migration katmanları **zero-touch**. 008'deki per-adapter constants pattern catalog selector'ları için doğal olarak genişler — namespace çatışması yok. Search→catalog_url cache pattern'i Enderyapı'dan kopyalanır (`enderyapi.ts:850-979`); her sitenin DOM'una göre selector'lar adapte edilir.

## Phase 0 — Research

Tüm bilinmeyenler ve teknik kararlar [research.md](research.md)'de:

1. **R-001** — İkizler catalog URL pattern (search vs direct navigate)
2. **R-002** — Levent Şimşek catalog URL pattern
3. **R-003** — Catalog detay sayfası selector keşif stratejisi (CSS class/id öncelikli, 006 deneyimi)
4. **R-004** — `RawOrderItem.catalogUrl` yakalama stratejisi (getOrderDetail içinde opsiyonel anchor click veya direkt parse)
5. **R-005** — KDV oranı catalog sayfasında parse edilemediği zaman fallback (%20 default vs `vat-rate-missing` fail)
6. **R-006** — Liste fiyatı + iskonto metni parse edilemediği zaman davranış (ham fiyat yeterli mi?)
7. **R-007** — Marka/brand alanı opsiyonel — null kabul kararı
8. **R-008** — Pagination olasılığı (catalog scope sipariş'ten geldiği için pagination irrelevant; doğrulanır)

## Phase 1 — Design & Contracts

### Data Model ([data-model.md](data-model.md))

**Yeni tablo, RLS, RPC YOK.** Mevcut şema (006'dan) yeterli:

- `products`: `code` (text), `last_seen_at` (timestamptz), `catalog_url` (text nullable), `vat_rate` (numeric) — tüm alanlar 006'dan mevcut.
- `price_snapshots`: `product_id`, `captured_at`, `unit_price_with_vat`, `unit_price_excl_vat`, `vat_rate`, `list_price`, `discount_text`, `source` — 006 migration'ı ile yapılandı. **İkizler ve Levent ürünleri aynı tabloya yazılır**; `supplier_id` ilişkisi `products.supplier_id` üzerinden dolaylı.
- `scrape_runs.summary`: JSONB `{ snapshots_added, products_observed, ... }` — 004/006'dan mevcut.

Detaylar [data-model.md](data-model.md)'de.

### Contracts ([contracts/](contracts/))

Üç sözleşme dökümanı:

- **[adapter-catalog-contract.md](contracts/adapter-catalog-contract.md)** — `scrapeCatalog(ctx, targets) → CatalogScrapeResult[]` metodu için input/output, failure mode taxonomy, idempotency garantileri, başarı kriterleri. Mevcut `types.ts:38-62` ile birebir uyumlu olmalı.
- **[ikizler-catalog-discovery.md](contracts/ikizler-catalog-discovery.md)** — İkizler ASP.NET MVC catalog sayfası DOM keşif rehberi: olası URL pattern'leri (BelgeTipDetayID, ?p=urun_detay, query-string varyasyonları), selector aday'ları, screenshot dump yöntemi.
- **[leventsimsek-catalog-discovery.md](contracts/leventsimsek-catalog-discovery.md)** — Levent Şimşek PHP catalog sayfası DOM keşif rehberi: `?p=showproducts`/`?p=urun_detay` olasılıkları, modal vs full-page render, search endpoint olasılığı.

Bu kontratlar implementer için "selector keşfi sırasında hangi sırayla deneyeceği" rehberidir — davranışsal sözleşmeler.

### Quickstart ([quickstart.md](quickstart.md))

Yerel + production smoke test akışı (008 quickstart'ı catalog phase için genişler):

1. **Adapter geliştirme** — diag script + headed Playwright ile DOM keşfi (İkizler ve Levent paralel)
2. **Local catalog smoke** — `npm run scrape:all -- --supplier ikizler` (catalog phase çalışır, --skip-catalog YOK)
3. **Local idempotency** — aynı komut 2 kez → ikinci koşumda `snapshots_inserted=0`
4. **Catalog URL cache doğrulama** — ilk koşum search'le bulur, ikinci koşumda DB'deki `catalog_url` cache'inden direkt navigate (hızlı)
5. **Production smoke** — settings → İkizler "Şimdi tetikle" → 5–10 dk içinde "Son koşumlar"da catalog özet alanları dolu
6. **`/dashboard/price-changes` doğrulama** — 24 saat sonra ikinci snapshot alındığında zamlanan ürünler listede İkizler/Levent ürünleri görünür
7. **Hata izolasyonu testi** — İkizler catalog selector kırık olsa bile orders DB'ye yazılmış olmalı (manuel rollback test)

### Agent Context Update

`CLAUDE.md` SPECKIT bloğunda:
- **Aktif feature**: `009-multi-supplier-catalog` — plan: `specs/009-multi-supplier-catalog/plan.md`
- 008 satırı tamamlanan listesinde kalır (zaten orada).

## Constitution Re-check (post-design)

Phase 1 design sonrası değişiklik yok:

- Yeni paket, tablo, RPC, RLS, migration eklenmedi → güvenlik ve maliyet yüzeyi sabit.
- Adapter pattern korundu → 2026-05-15 mimari kararı uygulandı.
- Per-adapter constants pattern korundu → 2026-05-17 (008) kararı genişletildi.
- HTTP risk durumu değişmedi (zaten kabul edilmiş, catalog fazı aynı risk).
- Catalog hata izolasyonu orchestrator level'da kurulu (006); doğrulama quickstart'ta.

**Phase 0 + Phase 1 PASS**. Sonraki adım: `/speckit-tasks` ile task breakdown.

## Complexity Tracking

> Tüm gate'ler PASS — bu bölüm boş.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
