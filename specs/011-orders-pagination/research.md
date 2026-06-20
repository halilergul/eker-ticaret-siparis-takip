# Research — Phase 0

**Feature**: Bayi Panel Sipariş Pagination
**Date**: 2026-06-20

Bu doküman pagination implementasyonu öncesi cevaplanması gereken keşif sorularını ve adapter başına araştırma planını içerir. DOM keşfi sırasında bulunan somut detaylar buraya geri yazılır (iteratif).

---

## R-001: Pagination DOM/URL pattern keşif stratejisi

**Decision**: Her tedarikçi için lokal `<slug>-diag.ts` script'i çalıştırıp sipariş listesi sayfasının HTML'ini ve screenshot'ını dump et. Manual inceleme ile şunları tespit et:

1. **"Sonraki sayfa" buton/link** — DOM selector + tıklama davranışı (full reload vs JS-driven)
2. **Sayfa numara butonları** — varsa, "Toplam X sayfa" bilgisi
3. **URL pattern** — `?sayfa=N` veya `?page=N` veya POST form mu?
4. **Sayfa boyutu** — sayfa başı kaç satır (default)
5. **Sayfa boyutu seçici** — varsa "Sayfada göster: 10/25/50/100" dropdown
6. **Boş sayfa davranışı** — out-of-range URL ne dönüyor?

**Rationale**: 010'da Yedekler için aynı diag pattern başarıyla çalıştı; iteratif keşif → constants → adapter loop akışı kanıtlandı.

**Alternatives considered**:
- ❌ "Network tab kaydı + cURL replay" — daha doğru ama Playwright API ile entegrasyonu zaman alıyor; diag DOM dump şu an için yeterli
- ❌ "Sitemap / API endpoint discovery" — bayi paneller genelde scrapable API sunmuyor; HTML scrape standart yol

**Next action**: 4 diag script'ini Implementation phase'de çalıştır, bulguları aşağıdaki R-002 - R-005'e yaz.

---

## R-002: Enderyapı pagination DOM (RESOLVED — 2026-06-20 diag)

**Site**: `b2b.enderyapi.com.tr/siparislerim` (SPA — React/Vue).

**Keşif sonucu**:
- **Strategy**: URL-based (`?page=N` query string)
- **Selector**: button "Sonraki" + page numbers, ama URL pattern çalışıyor → button-click gereksiz
- **URL pattern**: `/siparislerim?page={page}` (1-indexed)
- **Page size**: 20
- **hasNext signal**: Sayfa N+1'in `?page=N+1`'inde tüm satırlar daha önce görülmüşse veya 0 satır
- **Toplam sayfa**: 10 sayfa × 20 = 172 sipariş (gözlemlenen; DB önceki 62, 7 ay backfill ile Kasım 2025'e geri)
- **Implementation**: `lib/scraper/adapters/enderyapi.ts:listOrders` parseCurrentOrdersPage + while loop pattern (Yedekler ile aynı şablon)

---

## R-003: İkizler Hırdavat pagination DOM (RESOLVED — 2026-06-20 diag)

**Site**: `bayi.ikizlerhirdavat.com/Home/Belgeler?BelgeTipDetayID=134` (HTTPS!).

**Keşif sonucu**:
- **Strategy**: NONE (single page)
- **Sayfa 1**: 19 satır (panel'de gösterilen toplam)
- **Pagination DOM**: YOK — ne "Sonraki" buton, ne sayfa numara, ne `?page=N` URL pattern (Status 500)
- **Modal interaction**: pagination yok olduğu için sorun değil
- **DB vs panel**: DB'de 24 sipariş (panel'de 19) — 5 eski sipariş zaman içinde panel'den düşmüş, DB'de hala mevcut (veri kaybı yok, eski geçmiş korunuyor)
- **Implementation**: `lib/scraper/adapters/ikizler.ts:listOrders` sonunda `ctx.pagesVisited = 1` telemetry; mevcut davranış aynı

---

## R-004: Levent Şimşek pagination DOM (RESOLVED — 2026-06-20 diag)

**Site**: `liste.leventsimsekarmatur.com` (HTTPS).

**Keşif sonucu**:
- **Strategy**: NONE (single page)
- **Diag note**: Login formu `cusername` selector 2 element'e resolve oluyor + ilk element hidden; diag bu sebepten fail oldu. Mevcut adapter farklı yol kullanıyor (USERNAME_INPUTS aday'ları başka sırada deniyor) — production'da çalışıyor.
- **Sayfa 1**: 8 sipariş (panel'de gösterilen toplam)
- **DB vs panel**: DB'de 11 sipariş (panel'de 8) — 3 eski sipariş, İkizler'de olduğu gibi panel'den düşmüş ama DB'de korunuyor
- **Implementation**: `lib/scraper/adapters/leventsimsek.ts:listOrders` sonunda `ctx.pagesVisited = 1` telemetry; mevcut davranış aynı

---

## R-005: Yedekler İnşaat pagination DOM (RESOLVED — 2026-06-20 diag)

**Site**: `bayi.yedekler.com.tr/Siparislerim.asp` (Classic ASP).

**Keşif sonucu**:
- **Strategy**: URL-based (`?sayfa=N` — catalog 010'da kanıtlanmıştı)
- **URL pattern**: `/Siparislerim.asp?sayfa={page}` (1-indexed; parametresiz = sayfa 1)
- **Page size**: 50 (default)
- **hasNext signal**: Sayfa N+1'in 0 satır döndürmesi (`?sayfa=99` test edildi → boş tablo, Status 200)
- **Toplam sayfa**: 2 dolu sayfa = 62 sipariş (sayfa 1: 50, sayfa 2: 12) + sayfa 3 boş → loop pagesVisited=3 (ziyaret edilen sayfa)
- **DB değişimi**: 50 → 62 (12 yeni sipariş, 2026-01-22'ye geri)
- **Implementation**: `lib/scraper/adapters/yedekler.ts:listOrders` parseCurrentOrdersPage + while loop pattern

---

## R-006: Adapter loop yapısı (genel pattern)

**Decision**: Pseudocode (4 adapter için ortak ana iskelet, panel-spesifik kısımlar inline):

```typescript
async function listOrders(ctx, limit?) {
  await navigateToOrdersPage(ctx); // sayfa 1 (zaten yapıyor)

  const collected: RawOrderSummary[] = [];
  const seenOrderNos = new Set<string>();
  let pageIndex = 1;
  const MAX_PAGES = 50; // safety

  while (pageIndex <= MAX_PAGES) {
    const rows = await parseRowsOnCurrentPage(ctx); // mevcut parse mantığı

    let addedThisPage = 0;
    for (const row of rows) {
      if (seenOrderNos.has(row.orderNo)) continue; // tekrar gelen satır → durdu
      seenOrderNos.add(row.orderNo);
      collected.push(row);
      addedThisPage++;
      if (limit && collected.length >= limit) return collected;
    }

    if (addedThisPage === 0) break; // boş sayfa veya hepsi tekrar → son sayfa

    const hasNext = await checkNextPage(ctx); // adapter-spesifik
    if (!hasNext) break;

    await navigateToNextPage(ctx, pageIndex + 1); // adapter-spesifik
    pageIndex++;
  }

  vlog(ctx, `Pagination: ${pageIndex} sayfa, ${collected.length} sipariş`);
  ctx.pagesVisited = pageIndex; // scrape_runs.summary için
  return collected;
}
```

**Rationale**:
- `seenOrderNos` ekstra koruma — aynı sayfa iki kez gösterilirse veya pagination düğmesi yanlış davranırsa sonsuz döngüyü engeller
- `MAX_PAGES = 50` safety (50 × 50 = 2500 sipariş, gerçekçi limit üzerinde)
- `addedThisPage === 0` çıkış koşulu, "boş sayfa" + "tüm satırlar tekrar" durumlarını birden yakalar
- `checkNextPage`/`navigateToNextPage` adapter-spesifik — her panel kendi DOM'una göre

**Alternatives considered**:
- ❌ `for (let p = 1; p <= MAX; p++) { fetchPage(p); }` — basit ama "boş sayfa" sinyalini ele almaz, MAX'a kadar boş istek atar
- ❌ Recursive fetch — yığın taşma riski + okunabilirlik düşük

---

## R-007: ScrapeSummary.pages_visited entegrasyonu

**Decision**: `ScrapeContext`'e opsiyonel `pagesVisited?: number` alanı ekle. Adapter `listOrders` döngü bitiminde `ctx.pagesVisited = N` yazar. `scripts/scrape/orders.ts` summary'i build ederken bu alanı `summary.pages_visited` olarak Supabase'e yazılır.

**Rationale**:
- scrape_runs.summary JSONB → şema değişikliği yok
- Operatör (ya da agent) DB sorgusuyla "Yedekler kaç sayfa gezdi?" sorusuna cevap bulur
- Backwards compatible: alan yoksa eski runs için undefined

**Alternatives considered**:
- ❌ scrape_runs tablosuna ayrı kolon ekle — şema migration gerekir, esnek değil
- ❌ Sadece log'a yaz — DB sorgusu yapılamaz, audit kaybolur

---

## R-008: Timeout ve graceful stop

**Decision**: `scripts/scrape/orders.ts` (ve `all.ts`) zaten `GLOBAL_TIMEOUT_MS` ile global timeout kontrolü yapıyor (catalog.ts'de gördüm). Pagination loop her sayfa başında bu kontrolü yapmalı:

```typescript
if (Date.now() - startTime > GLOBAL_TIMEOUT_MS) {
  vlog(ctx, `Timeout: ${pageIndex} sayfada durduruldu`);
  break; // partial result
}
```

Sonuç: status `partial` olur, summary `pages_visited=N` ile son ulaşılan sayfa görünür. Sonraki koşum baştan tekrar gezer ama idempotency korunduğu için zaten DB'de olan siparişler skip edilir.

**Rationale**: Mevcut 8dk timeout korunur; pagination bunu silently kırmaz.

**Alternatives considered**:
- ❌ "Son başarılı sayfayı DB'ye yaz, sonraki koşum oradan başla" — state stateful, idempotency garantisini bozar
- ❌ Timeout uzat (8→15dk) — sıfır maliyet riski (free tier)

---

## R-009: Test stratejisi

**Decision**: Manual quickstart 010 pattern'ini takip et:

1. **Smoke**: Her tedarikçi için `npm run scrape:orders -- --supplier <slug> --verbose`
2. **DB doğrulama**: Sipariş sayısı operatörün panel'de gördüğü toplama eşit mi (operatör manuel kontrol)
3. **İdempotency**: Smoke arka arkaya tekrar çalıştır; summary `orders_inserted=0`
4. **Production smoke**: `gh workflow run scrape.yml -f supplier=<slug>` — runner'da pagination çalışıyor mu

**Rationale**: 010'da aynı pattern kullanıldı, production'a güvenli geçiş sağladı.

**Alternatives considered**:
- ❌ Vitest unit test — DOM scrape side-effect ağır; mock Playwright pratik değil
- ❌ E2E test (Playwright test runner) — overhead yüksek, manual smoke yeterli (mevcut codebase test'siz)

---

## Open Questions (RESOLVED)

- ✅ Her bayi panel DOM'unun pagination pattern'i: 2 URL-based (Enderyapı, Yedekler) + 2 single-page (İkizler, Levent)
- ⚠️ Toplam scrape süresi: Enderyapı production runner'da 21+ dk (orders 15dk + catalog 6dk). Workflow timeout 30 dk'ya çıkarıldı (free tier OK çünkü tüm schedule.enabled=false).
- ✅ Yedekler `?sayfa=N` sipariş listesinde de çalışıyor (catalog'la aynı pattern).

## Sonuçlar Özeti (4 adapter)

| Adapter | Strategy | URL pattern | Page size | DB önce → sonra | pages_visited |
|---|---|---|---|---|---|
| Enderyapı | URL | `/siparislerim?page=N` | 20 | 62 → 172 | 10 |
| Yedekler | URL | `/Siparislerim.asp?sayfa=N` | 50 | 50 → 62 | 3 |
| İkizler | None | — | — | 24 (panel 19) | 1 |
| Levent | None | — | — | 11 (panel 8) | 1 |

**Toplam yeni sipariş**: 122 (Enderyapı 110 + Yedekler 12). Eski siparişler İkizler/Levent'te DB'de korunuyor (panel'den düştüler ama tarih veri sürdürülüyor).
