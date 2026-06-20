# Implementation Plan: Bayi Panel Sipariş Pagination (4 Tedarikçi)

**Branch**: `011-orders-pagination` | **Date**: 2026-06-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/011-orders-pagination/spec.md`

---

## Summary

4 tedarikçi adapter'ının (`enderyapi`, `ikizler`, `leventsimsek`, `yedekler`) `listOrders` fonksiyonuna **pagination loop** ekleyerek bayi panellerinde mevcut tüm sipariş geçmişini DB'ye çekiyoruz. Mevcut idempotency (orderNo unique constraint) duplicate'leri engelliyor; ikinci koşumlar erken duruyor.

**Teknik yaklaşım**:

1. **DOM keşfi** — her panel için ya mevcut `<slug>-diag.ts` script'i genişletilir ya da yenisi yazılır (`enderyapi-diag.ts`, `ikizler-diag.ts`, `leventsimsek-diag.ts`; `yedekler-diag.ts` zaten var). Diag pagination DOM/URL pattern'ini ve toplam sayfa sayısını dump eder.
2. **Constants güncelleme** — her `<slug>.constants.ts` dosyasına `PAGINATION_SELECTORS` (next button, page numbers) + `PAGINATION_URL_TEMPLATE` (gerekirse) eklenir.
3. **Adapter loop** — her `<slug>.ts`'in `listOrders` fonksiyonu `while (hasNext && pages < MAX) { ... }` döngüsüne sarılır. Sayfa başı parse mantığı korunur, sadece dış döngü eklenir.
4. **Summary genişletme** — `ScrapeSummary` interface'ine `pages_visited?: number` alanı opsiyonel olarak eklenir. scrape_runs.summary JSONB zaten extensible.
5. **Test** — lokal `npm run scrape:orders -- --supplier <slug>` her tedarikçide DB sayısının arttığını doğrular; ikinci koşum 0 yeni satır.
6. **Production smoke** — her tedarikçi için `gh workflow run scrape.yml` ile manual trigger; success + idempotent kalır.

---

## Technical Context

**Language/Version**: TypeScript 5.x strict, Node 22 (runner), Next.js 15 App Router

**Primary Dependencies**: Playwright (Chromium headless), Supabase JS client, dotenv, zod (creds validation)

**Storage**: Supabase Postgres — mevcut `supplier_orders`, `order_items`, `scrape_runs` tabloları (şema değişikliği yok)

**Testing**: Manuel quickstart (010/009'daki pattern); birim test yok (DOM scrape side-effect)

**Target Platform**: GitHub Actions Ubuntu runner (production), macOS dev (lokal)

**Project Type**: Web-fullstack — scraper module değişikliği (frontend etkilenmez)

**Performance Goals**: Adapter başına ilk koşum ≤ 8 dk (cron timeout); ikinci koşum ≤ 4 dk

**Constraints**:
- Free tier korunur (GH Actions ~600 dk/ay tahmini, 2000dk limit içinde)
- B2B credentials log'a / output'a sızmaz
- Mevcut DOM tabanlı idempotency (orderNo unique) yıkılmaz
- Catalog scrape akışı değişmez (009'da kurulan izolasyon korunur)

**Scale/Scope**: 4 adapter × ~100-200 sipariş ortalama × sayfa başı 25-50 satır = max ~10 sayfa × 4 tedarikçi = 40 sayfa toplam (production)

---

## Constitution Check

*GATE: Pass before Phase 0. Re-checked after Phase 1.*

### Constitution Items vs 011 Scope

| # | Item | Verdict | Notes |
|---|------|---------|-------|
| 1 | Adapter pattern (her tedarikçi ayrı modül) | ✅ Korunur | Sadece `listOrders` davranışı genişler; adapter sınırı değişmez |
| 2 | B2B credentials encrypted GH Secrets | ✅ Etkilenmez | Yeni secret yok; mevcut 4×2-3 credential kullanılır |
| 3 | Sıfır maliyet (free tier) | ✅ Geçer | İlk koşum bir defa 8dk, sonraki koşumlar ortalama 4dk × 4 supplier × günde 1 (cron schedule) = ~16 dk/gün → ~480 dk/ay (GH Actions free 2000 dk limit) |
| 4 | RLS policies zorunlu | ✅ Etkilenmez | DB şema değişmez; mevcut RLS'ler korunur |
| 5 | Şifre log'lanmaz | ✅ Diag/log'da credentials yok | DOM dump'ı login form değerlerini yazmıyor (010 yedekler-diag pattern korunur) |
| 6 | DOM kırılma risk yönetimi | ✅ Adapter constants pattern | Pagination selector'ları `<slug>.constants.ts`'te toplanır, DOM keşfi sonrası iteratif refine |
| 7 | Site DOM değişimi → adapter loglar | ✅ pages_visited summary'de | Yeni telemetry ile pagination iz takip edilir |
| 8 | Catalog hata izolasyonu (009 kararı) | ✅ Etkilenmez | `scripts/scrape/all.ts` orders/catalog try/catch ayrımı korunur |

### Gate sonucu: **PASS**

Free tier riski **düşük** çünkü:
- Cron `daily_hour_utc` ile günde 1 tedarikçi tetikler (saatlik kontrol → DB hour-gate)
- İkinci ve sonraki koşumlar pagination ile gezdiği halde duplicate skip nedeniyle 4 dk civarı biter
- Pagination ekstra maliyet sadece **ilk backfill koşumu**nda (1×8dk × 4 supplier = 32dk one-time)

### Free Tier Geri Çekilme Planı

Eğer aylık GH Actions kullanımı 1500dk'yı (free tier %75'i) aşarsa:
1. `--limit N` flag default 100 yapılır (sayfa başı 25 = max 4 sayfa)
2. Cron `daily_hour_utc` artırılarak haftada 2-3 tetikleme
3. Adapter "son N gün filtresi" eklenir (mevcut spec anti-goal; gerekirse 012'de)

---

## Project Structure

### Documentation (this feature)

```text
specs/011-orders-pagination/
├── plan.md                # Bu dosya
├── research.md            # Phase 0: DOM keşif planı + en iyi pratikler
├── data-model.md          # Phase 1: scrape_runs.summary genişlemesi
├── contracts/
│   └── adapter-listorders.md  # Phase 1: listOrders interface spec
├── quickstart.md          # Phase 1: Lokal test akışı
├── tasks.md               # Phase 2 (/speckit-tasks output, henüz yok)
└── checklists/
    └── requirements.md    # Spec quality checklist (✅ 12/12)
```

### Source Code (repository root)

```text
lib/scraper/
├── adapters/
│   ├── enderyapi.ts             # ← listOrders pagination loop ekle
│   ├── enderyapi.constants.ts   # ← PAGINATION_SELECTORS ekle (yoksa yeni dosya)
│   ├── ikizler.ts               # ← listOrders pagination loop
│   ├── ikizler.constants.ts     # ← PAGINATION_SELECTORS
│   ├── leventsimsek.ts          # ← listOrders pagination loop
│   ├── leventsimsek.constants.ts# ← PAGINATION_SELECTORS
│   ├── yedekler.ts              # ← listOrders pagination loop
│   └── yedekler.constants.ts    # ← PAGINATION_SELECTORS
├── types.ts                     # ← ScrapeSummary.pages_visited opsiyonel ekle
└── (adapter-registry.ts, errors.ts, run-logger.ts, supabase-writer.ts: değişmez)

scripts/scrape-tools/
├── enderyapi-diag.ts            # ← yeni, pagination DOM keşfi
├── ikizler-diag.ts              # ← yeni
├── leventsimsek-diag.ts         # ← yeni
└── yedekler-diag.ts             # ← mevcut, pagination phase eklenebilir

scripts/scrape/
├── orders.ts                    # ← summary çıktısı pages_visited ekler (varsa)
├── all.ts                       # ← değişmez
└── catalog.ts                   # ← değişmez
```

**Structure Decision**: Mevcut adapter mimarisi tamamen korunur. Pagination kodu her adapter'a inline gömülür (DRY refactor yapılmaz — her panel DOM'u farklı, ortak helper yapay olur). Eğer keşif sonunda 4 panel **tam aynı** "Sonraki sayfa" linki kullanıyorsa, **o zaman** `lib/scraper/common/pagination.ts` yardımcısı çıkartılır. Plan default: adapter-içi inline.

---

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| Her adapter için ayrı pagination kodu (potansiyel DRY ihlali) | 4 panel'in DOM/URL pattern'i farklı; ortak helper en yüksek paydadan az ortak içerir | Ortak helper soyutlaması erken — rule-of-three sağlanmadı; refactor sonradan yapılır (gerek görüldüğünde) |

---

## Implementation Phases

| Phase | Output | Status |
|-------|--------|--------|
| Phase 0 | research.md (DOM keşif stratejisi + en iyi pratikler) | ⏳ Sıradaki |
| Phase 1 | data-model.md + contracts/ + quickstart.md | ⏳ Phase 0 sonrası |
| Phase 2 | tasks.md (`/speckit-tasks` çağrısı) | ⏳ Plan tamamlandıktan sonra |
| Phase 3 | DOM keşfi (4 diag çalıştır, manuel HTML/screenshot inceleme) | ⏳ Implement aşaması |
| Phase 4 | Adapter implementasyonu (4 paralel, her biri kendi panel DOM'una göre) | ⏳ Implement |
| Phase 5 | Lokal smoke + idempotency + production smoke | ⏳ Implement |
