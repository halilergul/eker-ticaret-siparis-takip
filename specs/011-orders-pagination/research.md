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

## R-002: Enderyapı pagination DOM (PENDING — DOM keşif gerekli)

**Site**: `b2b.enderyapi.com.tr/Default.aspx` (ya da panel URL).

**Mevcut**: `enderyapi.ts` `listOrders` 62 sipariş döndürüyor (DB sayısı). Bu sayfa default boyutuyla bir sayfaya sığıyor olabilir, ya da silently truncated.

**Keşif soruları**:
- Sipariş listesi sayfasında pagination kontrolü görünür mü?
- Toplam sipariş sayısı 62'den çok mu az mı?
- "Sonraki sayfa" mı, sayfa numara butonu mu, infinite scroll mı?

**Beklenen pattern**: ASP.NET form-based postback (Enderyapı bayipro Classic ASP.NET) — sayfa numara butonu tıklamada `__EVENTTARGET` parametresi ile postback. Playwright `.click()` ile çalışır ama URL değişmeyebilir.

**Decision template (keşif sonrası doldurulacak)**:
```
Selector: ___
Strategy: button-click | url-template | infinite-scroll
URL pattern: ___ (varsa)
Page size: ___
hasNext signal: ___
```

---

## R-003: İkizler Hırdavat pagination DOM (PENDING)

**Site**: `bayi.ikizlerhirdavat.com` — HTTP plaintext (CONSTITUTION 2026-05-17 kararı ile kabul edildi).

**Mevcut**: `ikizler.ts` `listOrders` 24 sipariş döndürüyor (DB). 5 aylık dönem için makul görünüyor ama keşif gerekli.

**Keşif soruları**:
- 24 toplam mı yoksa default sayfa boyutu mu?
- İkizler 010'da modal-tabanlı detay parsing kullanıyordu (her satır için modal açıp ürün listesi çıkar), pagination de modal'ı kapatıp tablo seviyesinde mi?

**Risk**: Modal trigger + pagination birlikte race condition oluşturabilir — diag bunu test etmeli.

**Decision template**:
```
Selector: ___
Strategy: ___
URL pattern: ___
Page size: ___
Modal interaction: yeni sayfaya geçmeden modal kapanmalı mı? (todo: doğrula)
```

---

## R-004: Levent Şimşek pagination DOM (PENDING)

**Site**: `bayi.leventsimsek.com` (veya tam URL).

**Mevcut**: 11 sipariş (DB), 6 aylık dönem — gerçekten az olabilir (Eker Ticaret Levent'ten az alışveriş yapıyor olabilir).

**Keşif soruları**:
- 11 gerçekten toplam mı, yoksa pagination var mı?
- Levent siparişlerinde "29 Ara 2025" gibi uzun TR tarih formatı kullanılıyordu (008 kararı) — sayfa başına atlamada tarih filtresi kayboluyor mu?

**Decision template**: yukarıdaki gibi.

---

## R-005: Yedekler İnşaat pagination DOM (PENDING)

**Site**: `bayi.yedekler.com.tr/Siparislerim.asp`.

**Mevcut**: 50 sipariş (DB, yuvarlak) — kuvvetli sayfa boyutu sınırı sinyali.

**Bilinen**: Classic ASP, `Siparislerim.asp`. URL parametresi pattern `?sayfa=N` (catalog için kullanıldı, 010 araştırması), aynı olabilir mi?

**Keşif soruları**:
- Sipariş listesinde `?sayfa=N` çalışıyor mu?
- Sayfa başı 50'den fazla seçilebiliyor mu (dropdown)? Eğer evet, hepsini tek seferde 100/200 yapmak basit fix.
- 50'lik default boyutta sayfa 2, 3, ... var mı?

**Yedekler için en hızlı kazanım**: Eğer URL pattern aynı `?sayfa=N` → adapter loop'u catalog'da kanıtlanmış pattern'i tekrar kullanır.

**Decision template**: yukarıdaki gibi.

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

## Open Questions (Implementation aşamasında çözülecek)

- Her bayi panel DOM'unun **somut** pagination pattern'i (R-002 - R-005)
- Toplam sipariş sayısı 4 tedarikçide gerçekten 8dk içinde mi kalıyor (sadece ölçüm)
- Yedekler `?sayfa=N` URL pattern'i sipariş listesinde de geçerli mi (catalog'da kanıtlandı)

Bu sorular **DOM keşfi (Phase 3)** sırasında cevaplanır, bulgular bu dosyaya geri yazılır.
