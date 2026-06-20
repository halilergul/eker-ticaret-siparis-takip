# Adapter `listOrders` Contract — Phase 1

**Feature**: Bayi Panel Sipariş Pagination
**Date**: 2026-06-20

Bu doküman, 011 sonrası her adapter'ın `listOrders` fonksiyonunun uyması gereken contract'ı tanımlar.

---

## TypeScript İmza (değişmez)

```typescript
type RawOrderSummary = {
  orderNo: string;
  status: string;
  orderedAt: string;       // ISO 8601 (UTC normalized)
  totalAmount: number;     // KDV dahil müşteri toplam (TL)
  detailUrl?: string;      // sipariş detayı için absolute URL
};

interface ScraperAdapter {
  // ... mevcut method'lar
  listOrders(ctx: ScrapeContext, limit?: number): Promise<RawOrderSummary[]>;
}
```

İmza **değişmez** — mevcut 4 adapter'ın signature'ı korunur. Pagination implementation detail'dir, caller'ı etkilemez.

---

## Davranış Sözleşmesi

### MUST (zorunlu davranışlar)

1. **Tüm sayfaları gez** — Bayi panelinde sipariş listesi `N` sayfa içeriyorsa adapter `N` sayfayı sırayla ziyaret edip her sayfanın `RawOrderSummary[]` satırlarını birleştirip döndürür.
2. **Limit kontrolü** — `limit > 0` verilirse, döngü `collected.length >= limit` olduğunda durur (limit-aşımı sayfa kısmen taranabilir; ek satırlar atılır).
3. **Duplicate koruması** — Aynı `orderNo` iki kez döndürülmez (Set ile dedup zorunlu).
4. **`pages_visited` kaydı** — Döngü bitiminde `ctx.pagesVisited = N` set edilir (`ScrapeContext`'e eklenecek opsiyonel alan).
5. **Boş sayfa durumu** — Bir sayfa hiç satır vermezse veya tüm satırları daha önce görülmüşse, döngü orada durur (sonsuz döngü ya da gereksiz network koruması).
6. **Login session koruma** — Pagination ortasında session düşerse (örn. login sayfasına redirect), adapter ya re-login dener ya da `ScrapeError({ mode: "auth-expired" })` fırlatır.
7. **`vlog` ile sayfa raporu** — Verbose modda her sayfa için `vlog(ctx, "Sayfa N: M satır")` log'lanır (production'da kapalı, debug'ta açık).
8. **Safety upper bound** — `MAX_PAGES = 50` sabitiyle döngü gerekirse zorla durur, sonsuz döngü olamaz.

### SHOULD (önerilen)

1. **Global timeout farkındalık** — `Date.now() - startTime > GLOBAL_TIMEOUT_MS` kontrolü sayfa başında yapılır; aşılırsa döngü `break` ile durur, kısmi sonuç döner.
2. **Sayfa yükleme bekleme** — Her sayfa navigasyonundan sonra `await page.waitForTimeout(800)` veya `waitForLoadState("networkidle")` ile DOM stabilize edilir.
3. **Error tolerance per page** — Tek bir sayfa parse hatası tüm `listOrders`'ı kıramamalı; o sayfa skip + `ctx.pushError(...)`, sonraki sayfaya devam.

### MUST NOT (yasak)

1. **Sınırsız döngü** — `MAX_PAGES` safety atlanmaz.
2. **State leak** — Adapter, sayfa N'in DOM seçimini sonraki sayfaya taşımaz (her sayfa kendi parse scope'unda).
3. **Credentials log** — Diag/error log'larında müşteri kodu / kullanıcı kodu / şifre asla yazılmaz (CONSTITUTION şifre kuralı).
4. **DB write** — `listOrders` yalnızca okur, hiçbir DB yazımı yapmaz (yazımı caller `scripts/scrape/orders.ts` üstlenir).

---

## Pagination Strateji Tipleri

Her adapter aşağıdaki strateji tiplerinden **birini** uygular (DOM keşfine göre):

### Strateji A: URL-based pagination

```typescript
const url = `${BASE}/orders.asp?sayfa=${pageIndex}`;
await page.goto(url);
```

**Uygun adapter**: Classic ASP / PHP siteleri (Yedekler muhtemelen, Enderyapı muhtemelen)

**hasNext sinyali**: yeni sayfada tablo satırı sayısı 0 ya da tüm orderNo'lar daha önce görüldü.

### Strateji B: Button-click pagination

```typescript
const nextBtn = page.locator(PAGINATION_SELECTORS.NEXT_BUTTON);
if (await nextBtn.isVisible() && await nextBtn.isEnabled()) {
  await nextBtn.click();
  await page.waitForLoadState("networkidle");
} else {
  break;
}
```

**Uygun adapter**: ASP.NET postback, modern SPA paneller (İkizler / Levent muhtemelen)

**hasNext sinyali**: `nextBtn` disabled veya kayıp.

### Strateji C: Page number buttons

```typescript
const pageBtn = page.locator(`a:has-text("${pageIndex + 1}")`).first();
if (await pageBtn.count() > 0) {
  await pageBtn.click();
} else {
  break;
}
```

**Uygun adapter**: Bootstrap pagination ile siteler.

**hasNext sinyali**: Bir sonraki sayfa numarası butonu yok.

### Strateji D: No pagination (single page)

```typescript
// Mevcut davranış — döngü 1 kere çalışır, hasNext=false
```

**Uygun adapter**: Tüm siparişler tek sayfada (örn. Levent 11 sipariş).

---

## ScrapeContext Genişlemesi

```typescript
type ScrapeContext = {
  page: Page;
  supplierId: string;
  runId: string;
  verbose: boolean;
  debugDir: string;
  pushError(step: string, mode: FailureMode, detail: string): void;
  pagesVisited?: number;  // ← YENİ, opsiyonel
};
```

`scripts/scrape/orders.ts` (ve `all.ts`) listOrders sonrası `ctx.pagesVisited`'i okur, summary'e yazar:

```typescript
const orders = await adapter.listOrders(ctx);
if (ctx.pagesVisited !== undefined) {
  summary.pages_visited = ctx.pagesVisited;
}
```

---

## Test Senaryoları (her adapter için)

1. **Pagination çalışır**: `npm run scrape:orders -- --supplier <slug>` → DB orders count artar
2. **İdempotent**: Smoke arka arkaya iki kez → ikinci koşum `orders_inserted=0`
3. **Limit saygılı**: `--limit 5` → exact 5 sipariş döner (panel'de 100+ olsa bile)
4. **Tek sayfa durumu**: Panel'de sadece 1 sayfa varsa adapter `pagesVisited=1` ile döner, hata vermez
5. **Boş sayfa**: Manuel olarak `--limit 0` veya pagination max'a kadar git → graceful stop
6. **Timeout**: `TIMEOUT_OVERRIDE_MS=10000` ile çalıştır → status `partial`, `pages_visited` ulaşılan max sayfa

---

## Adapter-Specific Notes (DOM keşif sonrası doldurulacak)

### Enderyapı

- Strateji: TBD (keşif sonrası)
- Selector / URL: TBD
- Page size: TBD
- Toplam sayfa estimasyon: TBD

### İkizler

- Strateji: TBD
- Selector / URL: TBD
- Modal etkileşim: pagination sırasında modal kapalı olmalı (todo: doğrula)
- Page size: TBD

### Levent Şimşek

- Strateji: TBD (büyük olasılıkla D — single page, 11 sipariş)
- Selector / URL: TBD

### Yedekler

- Strateji: muhtemelen A (URL `?sayfa=N`, catalog'da kanıtlandı)
- Selector / URL: `/Siparislerim.asp?sayfa=N` — keşif gerekli
- Page size: 50 (mevcut yuvarlak sayı)
