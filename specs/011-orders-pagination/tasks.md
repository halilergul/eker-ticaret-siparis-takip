---

description: "Task list — Feature 011: Bayi panel sipariş pagination (4 tedarikçi)"
---

# Tasks: Bayi Panel Sipariş Pagination

**Input**: Design documents from `/specs/011-orders-pagination/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅
**Tests**: Test task'ları YOK (proje pattern'i — manual smoke + DB doğrulama)
**Organization**: Tasks user story başına gruplanır; 4 tedarikçinin adapter pipeline'ları US1 altında paralel substream olarak.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Different files / no dependency → parallel
- **[Story]**: US1 / US2 / US3
- File paths absolute (repo-relative)

---

## Phase 1: Setup & Foundational

**Amaç**: ScrapeContext + Summary tipleri pagination'ı destekleyecek hale gelsin. Diğer task'lar buna bağımlı.

- [ ] T001 ScrapeContext'e opsiyonel `pagesVisited?: number` alanı ekle — [lib/scraper/types.ts](lib/scraper/types.ts) (ScrapeContext type bloğu)
- [ ] T002 [P] ScrapeSummary'a opsiyonel `pages_visited?: number` alanı ekle — [lib/scraper/types.ts](lib/scraper/types.ts) (ScrapeSummary type bloğu)
- [ ] T003 [P] `emptySummary()` factory'ye `pages_visited: undefined` default ekle — [lib/scraper/types.ts](lib/scraper/types.ts)
- [ ] T004 scripts/scrape/orders.ts (varsa) + scripts/scrape/all.ts: `listOrders` sonrası `if (ctx.pagesVisited !== undefined) summary.pages_visited = ctx.pagesVisited;` — [scripts/scrape/all.ts](scripts/scrape/all.ts), `scripts/scrape/orders.ts` (varsa)

**Checkpoint**: Type altyapısı hazır — adapter'lar pagesVisited yazabilir, writer summary'e geçirir.

---

## Phase 2: User Story 1 — Tam sipariş geçmişi (Priority: P1) 🎯 MVP

**Goal**: 4 tedarikçi panelinde mevcut tüm sipariş kayıtları DB'ye çekilir. Operatör dashboard'da panel toplamına eşit sayıda sipariş görür.

**Independent Test**: Tek bir tedarikçide `npm run scrape:orders -- --supplier <slug>` → DB sayısı panel toplamına eşit (operatör doğrular).

> 4 tedarikçinin DOM'u farklı olduğu için 4 ayrı paralel substream (`US1-enderyapi`, `US1-ikizler`, `US1-leventsimsek`, `US1-yedekler`). Substream içi sıralı (diag → constants → adapter → smoke), substream'ler birbirinden bağımsız.

### Substream A — Enderyapı

- [ ] T010 [US1] Diag script genişlet/yaz — login + sipariş listesi + pagination phase: HTML dump + screenshot 2 sayfa için — [scripts/scrape-tools/enderyapi-diag.ts](scripts/scrape-tools/enderyapi-diag.ts) (yeni dosya)
- [ ] T011 [US1] Diag çalıştır + research.md R-002 sonucu yaz: strategy (URL / button / page-numbers / none), selector(lar), URL pattern, page size, toplam sayfa tahmini — [specs/011-orders-pagination/research.md](specs/011-orders-pagination/research.md)
- [ ] T012 [US1] Constants'a `PAGINATION_SELECTORS` + (gerekirse) `PAGINATION_URL_TEMPLATE` + `PAGINATION_MAX_PAGES` ekle — [lib/scraper/adapters/enderyapi.constants.ts](lib/scraper/adapters/enderyapi.constants.ts) (mevcut değilse oluştur, mevcut `scripts/scrape/constants.ts` ile çakışmayı önle)
- [ ] T013 [US1] `listOrders`'ı pagination loop'una sar: seenOrderNos Set + while döngüsü + global timeout farkındalık + ctx.pagesVisited = N — [lib/scraper/adapters/enderyapi.ts](lib/scraper/adapters/enderyapi.ts)
- [ ] T014 [US1] Lokal smoke: `npm run scrape:orders -- --supplier enderyapi --verbose` → DB count artıyor mu, `pages_visited > 0` mu, `partial`/`failed` değil

### Substream B — İkizler

- [ ] T020 [P] [US1] Diag script genişlet/yaz: ayrıca modal etkileşimi olmadan tablo pagination keşfi — [scripts/scrape-tools/ikizler-diag.ts](scripts/scrape-tools/ikizler-diag.ts) (yeni)
- [ ] T021 [US1] Diag çalıştır + research.md R-003 yaz; **özel kontrol**: pagination ortasında modal açık kalmamalı — [specs/011-orders-pagination/research.md](specs/011-orders-pagination/research.md)
- [ ] T022 [US1] Constants pagination ekle — [lib/scraper/adapters/ikizler.constants.ts](lib/scraper/adapters/ikizler.constants.ts)
- [ ] T023 [US1] `listOrders` pagination loop; modal trigger pagination'dan ÖNCE veya SONRA yapılıyor olmalı — sıra dikkat — [lib/scraper/adapters/ikizler.ts](lib/scraper/adapters/ikizler.ts)
- [ ] T024 [US1] Lokal smoke: ikizler — pagination + modal etkileşimi birlikte çalışıyor mu, DB count artıyor mu, idempotent

### Substream C — Levent Şimşek

- [ ] T030 [P] [US1] Diag script genişlet/yaz — [scripts/scrape-tools/leventsimsek-diag.ts](scripts/scrape-tools/leventsimsek-diag.ts) (yeni)
- [ ] T031 [US1] Diag çalıştır + research.md R-004 yaz; **likely outcome**: tek sayfa (11 sipariş gerçekten az) → strategy=none, listOrders değişmez gibi davranır
- [ ] T032 [US1] Constants pagination ekle (strategy=none ise minimal) — [lib/scraper/adapters/leventsimsek.constants.ts](lib/scraper/adapters/leventsimsek.constants.ts)
- [ ] T033 [US1] `listOrders` loop sarmalama (1 sayfa için bile loop çıkmaz, ctx.pagesVisited=1 yaz) — [lib/scraper/adapters/leventsimsek.ts](lib/scraper/adapters/leventsimsek.ts)
- [ ] T034 [US1] Lokal smoke: leventsimsek — pages_visited=1 görünür, DB count değişmez

### Substream D — Yedekler

- [ ] T040 [P] [US1] Yedekler diag genişlet: mevcut `yedekler-diag.ts`'e pagination phase ekle (sipariş listesi `?sayfa=N` denenmesi — catalog'da geçiyordu, sipariş listesinde de geçiyor mu?) — [scripts/scrape-tools/yedekler-diag.ts](scripts/scrape-tools/yedekler-diag.ts)
- [ ] T041 [US1] Diag çalıştır + research.md R-005 yaz; **likely outcome**: strategy=A (URL `/Siparislerim.asp?sayfa=N`), page_size=50 → ek sayfalar var
- [ ] T042 [US1] Constants'a `PAGINATION_URL_TEMPLATE` ekle — [lib/scraper/adapters/yedekler.constants.ts](lib/scraper/adapters/yedekler.constants.ts) (`/Siparislerim.asp?sayfa={page}` veya keşif sonucu URL)
- [ ] T043 [US1] `listOrders` pagination loop — [lib/scraper/adapters/yedekler.ts](lib/scraper/adapters/yedekler.ts) (catalog'daki paginated full-scan deneyiminden faydalan)
- [ ] T044 [US1] Lokal smoke: yedekler — DB count 50 → panel toplamına çıkar, pages_visited > 1

**Checkpoint**: 4 substream tamamlanınca US1 (P1) tam fonksiyonel. Her tedarikçinin DB sipariş sayısı panel toplamına eşit. MVP slice teslim edildi.

---

## Phase 3: User Story 2 — İdempotency teyit (Priority: P1)

**Goal**: 4 tedarikçide ardarda iki koşum yapılınca ikinci koşum 0 yeni satır yazar.

**Independent Test**: Her tedarikçide `scrape:orders` × 2 ardarda → ikinci koşum summary `orders_inserted=0, items_inserted=0`.

- [ ] T050 [US2] Lokal cross-supplier idempotency: 4 tedarikçi için `scrape:orders` × 2 arda arda, DB sorgusu ile her birinin son 2 scrape_runs satırını incele (`orders_inserted` her ikincide 0 mı) — manuel/script
- [ ] T051 [US2] Idempotency edge case: ilk koşum sırasında yeni sipariş gelirse (örn. Yedekler 87 → 88), ikinci koşum sadece 1 yeni ekler — manuel test (eğer canlı veri varsa)
- [ ] T052 [US2] scrape_runs.summary.pages_visited tutarlılığı: ikinci koşum aynı sayfa sayısını gezmeli (seenOrderNos sayfa boyunca aktif, ama her koşumda fresh) — DB sorgusu doğrulama

**Checkpoint**: İdempotency korunuyor — cron her saat aynı tedarikçiyi tetikleyecek olsa bile duplicate write olmaz.

---

## Phase 4: User Story 3 — Production smoke + timeout (Priority: P2)

**Goal**: 4 tedarikçi GH Actions runner'da pagination'lı scrape başarıyla bitiyor, 8 dk cron timeout'unu aşmıyor.

**Independent Test**: `gh workflow run scrape.yml -f supplier=<slug>` → success status, duration < 8 dk.

- [ ] T060 [US3] Push branch (`git push -u origin 011-orders-pagination`) — Vercel preview deploy etkisi yok (sadece scraper kod)
- [ ] T061 [P] [US3] `gh workflow run scrape.yml --ref 011-orders-pagination -f supplier=enderyapi -f trigger_type=manual` → run watch, success bekle
- [ ] T062 [P] [US3] Aynı yedekler için
- [ ] T063 [P] [US3] Aynı ikizler için
- [ ] T064 [P] [US3] Aynı leventsimsek için
- [ ] T065 [US3] 4 production run'ı DB sorgusu ile doğrula: scrape_runs son 4 satır status=success/partial, errors=[], pages_visited > 0 (Levent için =1 olabilir)
- [ ] T066 [US3] **Eğer herhangi bir tedarikçi timeout aşarsa**: `scrape.yml` workflow'da `timeout-minutes: 15 → 20` ve `TIMEOUT_OVERRIDE_MS: 480000 → 720000`. Commit + retry workflow. — [.github/workflows/scrape.yml](.github/workflows/scrape.yml)

**Checkpoint**: Production'da pagination çalışıyor; cron'lar saatlik schedule'a göre günde 1 kez tetiklenip idempotent kalır.

---

## Phase 5: Polish & Cross-Cutting

- [ ] T070 [P] CLAUDE.md "Tamamlanan feature'lar" listesine `011-orders-pagination` ekle, "Aktif feature" → 012 sıradaki (yoksa "yok") — [CLAUDE.md](CLAUDE.md)
- [ ] T071 [P] Constitution decision log'a 011 satırı ekle (pagination adapter-içi inline kararı + DRY refactor sonraya bırakıldı gerekçesi) — [.docs/CONSTITUTION.md](.docs/CONSTITUTION.md)
- [ ] T072 [P] research.md'deki R-002..R-005 placeholder'ları gerçek keşif sonuçlarıyla güncelle (final değerler) — [specs/011-orders-pagination/research.md](specs/011-orders-pagination/research.md)
- [ ] T073 PR aç: `gh pr create --base master --head 011-orders-pagination` — title + body (önceki-sonraki DB count + pages_visited + lokal/runner süreleri + idempotency teyit)
- [ ] T074 PR merge sonrası: branch sil (lokal + remote prune), master'da CLAUDE.md güncel mi teyit

---

## Bağımlılıklar / Yürütme Sırası

```
T001 (ScrapeContext type)
   ↓
T002, T003, T004 (Summary type + factory + writer) — [P]
   ↓
Substream A (T010-T014)  ─┐
Substream B (T020-T024)   ├─ Hepsi [P] çalışabilir (farklı dosyalar, T001-T004 sonrası)
Substream C (T030-T034)   │
Substream D (T040-T044)  ─┘
   ↓
T050-T052 (US2 idempotency teyit) — 4 substream sonrası
   ↓
T060 (push) → T061-T064 [P] (workflow run × 4) → T065 (DB doğrula) → T066 (timeout ayarı gerekirse)
   ↓
T070-T072 [P] (polish) → T073 (PR) → T074 (merge sonrası)
```

---

## Parallel Execution Examples

**4 substream tek seferde başlat** (her substream içinde sıralı):

```bash
# Diag yaz + çalıştır → constants → adapter → smoke
# 4 ayrı developer/agent paralel çalışabilir; aynı kişi yapacaksa sırayla yap
```

**Production smoke 4 tedarikçi paralel**:

```bash
gh workflow run scrape.yml --ref 011-orders-pagination -f supplier=enderyapi -f trigger_type=manual
gh workflow run scrape.yml --ref 011-orders-pagination -f supplier=ikizler -f trigger_type=manual
gh workflow run scrape.yml --ref 011-orders-pagination -f supplier=leventsimsek -f trigger_type=manual
gh workflow run scrape.yml --ref 011-orders-pagination -f supplier=yedekler -f trigger_type=manual
# workflow.yml concurrency.group = scrape-<supplier> → 4'ü aynı anda paralel çalışır
```

---

## Implementation Strategy (MVP-first)

**MVP minimum**: Phase 1 + Substream D (Yedekler — en kesin eksiklik). Sadece T001-T004 + T040-T044 → Yedekler için pagination çalışır, MVP teslim. Sonra diğer 3 tedarikçi.

**Tam V1**: Tüm 4 substream + US2 + US3 + Polish (T001-T074).

**Önerilen sıra**:

1. T001-T004 (foundational)
2. Substream D — Yedekler (en yüksek getiri, %50 → ?)
3. Substream A — Enderyapı (büyük olasılıkla pagination eksik, 62 sayısı tetkik gerektiriyor)
4. Substream B — İkizler (24 — orta öncelik)
5. Substream C — Levent (11 — muhtemelen no-op, hızlı kapanır)
6. US2 idempotency teyit (T050-T052)
7. US3 production smoke (T060-T066)
8. Polish (T070-T074)

---

## Notlar

- **Tasks template'i** tests bölümü içeriyordu; bu projede test task'ları YOK (proje pattern'i — manuel smoke + DB doğrulama yeterli, 005-010 boyunca tutarlı).
- **Substream A/B/C/D** birbirinden tamamen bağımsız — her substream MVP slice olarak teslim edilebilir.
- **MAX_PAGES safety**: Her adapter constants'ında `PAGINATION_MAX_PAGES = 50` sabit; sonsuz döngü riski sıfırlanır.
- **Global timeout**: Her adapter loop iterasyonu başında `Date.now() - startTime > GLOBAL_TIMEOUT_MS` kontrolü; aşılırsa graceful stop + `partial` status.
- **vlog**: Verbose modda her sayfa için "Sayfa N: M satır" log'u (production'da kapalı).
