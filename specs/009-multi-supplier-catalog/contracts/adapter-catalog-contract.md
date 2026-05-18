# Adapter Contract: `scrapeCatalog`

**Feature**: 009 | **Date**: 2026-05-17

Bu döküman, yeni adapter'ların (`ikizler`, `leventsimsek`) `scrapeCatalog` metodunu implement ederken uyacağı davranışsal sözleşmeyi tanımlar. Tip imzası `lib/scraper/types.ts` ile birebir uyumlu olmalıdır.

---

## Tip İmzası

```typescript
// lib/scraper/types.ts (mevcut — değişmez)
scrapeCatalog?(
  ctx: ScrapeContext,
  targets: CatalogScrapeTarget[],
): Promise<CatalogScrapeResult[]>;
```

### Input

```typescript
type CatalogScrapeTarget = {
  productCode: string;     // örn. "M8-CIVATA-15", "AR-1234"
  catalogUrl?: string | null;  // DB'deki cached URL (varsa)
};
```

- `productCode` — ürün kodu (tedarikçi-specific format). Adapter modify etmez.
- `catalogUrl` — opsiyonel cache; varsa adapter önce direkt navigate'i denemeli, başarısızsa search'e düşmelidir.

### Output

```typescript
type CatalogScrapeResult =
  | { ok: true; ... }     // başarılı snapshot
  | { ok: false; ... };   // mode-tagged failure
```

**Başarılı sonuç (`ok: true`)**:

```typescript
{
  ok: true;
  productCode: string;        // input ile aynı
  catalogUrl: string;         // resolved URL (cache hit veya search ile bulunan)
  productName?: string;       // catalog sayfasında bulunan tam ad (opsiyonel)
  brand?: string;             // marka (opsiyonel — parse edilemezse undefined)
  listPrice: number | null;   // KDV hariç liste fiyatı (referans, parse edilemezse null)
  discountText: string | null;  // "+%40+%12" gibi iskonto string'i (parse edilemezse null)
  unitPriceExclVat: number;   // KDV hariç net özel birim fiyat — ZORUNLU
  vatRate: number;            // KDV oranı (0.20 = %20)
  unitPriceWithVat: number;   // unitPriceExclVat * (1 + vatRate), kuruş hassasiyetinde
}
```

**Başarısız sonuç (`ok: false`)**:

```typescript
{
  ok: false;
  productCode: string;
  mode: FailureMode;          // taxonomy — aşağıdaki tabloya bak
  message: string;             // detay (credential, password içermemeli)
}
```

---

## Failure Mode Taxonomy

Mevcut `lib/scraper/errors.ts` failure mode'ları yeterli — yeni mode eklenmez. Catalog-spesifik öneriler:

| Durum | Mode | Mesaj örneği |
|-------|------|-------------|
| Cache miss + search 0 sonuç | `product-not-found` | `"Catalog detay sayfası açılamadı (direct + search ikisi de başarısız)"` |
| Sayfa açıldı ama fiyat alanı yok | `catalog-parse-failed` | `"KDV'siz Net Fiyat parse edilemedi (raw: null); HTML dump: scrape-debug/<runId>/<code>.html"` |
| KDV oranı bulunamadı | `vat-rate-missing` | `"KDV oranı parse edilemedi"` — VEYA adapter default %20 kabul edip `ok: true` döner (R-005 kararı) |
| Sayfa açıldı, fiyat 0 veya negatif | `catalog-parse-failed` | `"unitPriceExclVat=0 — şüpheli değer"` |
| Login session expired (mid-scrape) | `session-expired` | `"Login session expired — re-login gerekli"` |
| Network timeout | `timeout` | `"Catalog detay sayfası 60sn içinde yüklenmedi"` |
| Site'a 404 / 5xx | `network-error` | `"HTTP 404 — ürün catalog'tan kaldırılmış olabilir"` |

**Mesaj disiplini**: Username/şifre, session token, cookie değerleri mesaj içine ASLA yazılmaz (FR-014 ve spec FR-011).

---

## Davranış garantileri

### G1 — Idempotency

Adapter aynı `(productCode, catalogUrl)` input için **tutarlı sonuç** üretmeli. Aynı catalog sayfasında 5 sn arayla iki kez scrape:
- Başarılı ise: aynı `unitPriceExclVat`, `vatRate`, `unitPriceWithVat` döner.
- Snapshot duplikasyonu **adapter'ın sorunu değil** — orchestrator + writer + RPC seviyesinde idempotent (aynı gün/aynı fiyat → DB no-op).

### G2 — Catalog URL cache

Başarılı sonuçta `catalogUrl` her zaman dolu (`string`, `null` olamaz). Cache miss durumunda adapter search ile bulduktan sonra **bulunan URL'yi** result'a yazmalı → orchestrator `products.catalog_url`'a yazar → 2. koşum cache hit.

### G3 — Search bypass (cache hit davranışı)

Input'ta `target.catalogUrl` varsa:
1. Adapter `page.goto(target.catalogUrl, { waitUntil: 'domcontentloaded' })` ile direkt aç.
2. Sayfa 404 veya beklenmeyen redirect ise (`catalog-not-found`-benzeri durum), search fallback'e düş.
3. Cache hit ise log: `"catalog: cache hit <productCode> → <url>"`.

### G4 — Hata izolasyonu

Bir ürün için exception thrown olursa:
- Adapter o ürünü `{ ok: false, mode: ..., message: ... }` olarak result array'ine ekler.
- **Diğer ürünleri etkilemeden** loop devam eder.
- `try { ... } catch (err) { results.push({ ok: false, ... }) }` pattern'i — Enderyapı `enderyapi.ts:968-976`.

### G5 — Login state korunma

`scrapeCatalog` çağrılmadan önce orchestrator zaten `adapter.login(ctx)` çağırmış olur. Adapter:
- Login session'ı page state üzerinden korur (cookie / localStorage Playwright tarafından yönetilir).
- Mid-scrape session expire olursa `session-expired` mode ile fail edebilir; re-login adapter sorumluluğunda değil (V1; V2 retry).

### G6 — Progress logging

Verbose mode'da (`ctx.verbose === true`) her ürün için kısa log:
```
[catalog] 5/30 işlendi: AR-1234 → ₺54.56 (KDV hariç) × %20 = ₺65.47
```

### G7 — Timeout disiplini

Her ürün için adapter'ın iç işlemleri **30 saniye** içinde tamamlanmalı (idéal hedef; aşılırsa timeout):
- Cache hit: ~3-5 sn (1 navigate + 4-6 selector wait).
- Cache miss: ~10-15 sn (1 search + 1 result click + selector wait).

Tüm catalog phase için orchestrator'ın **8 dakika** iç timeout'u var (`TIMEOUT_OVERRIDE_MS=480000` 008/007'de kuruldu). Adapter bu süreyi aşarsa orchestrator kesintiye uğratır + remaining ürünleri "Global timeout" hatası ile işaretler.

---

## Sözleşme ihlali örnekleri

| İhlal | Sonuç | Düzeltme |
|-------|-------|----------|
| `ok: true` ama `unitPriceExclVat` 0 veya negatif | `record_price_observation` RPC CHECK constraint fail → DB-write error | Adapter pre-validate: `if (price <= 0) return { ok: false, mode: 'catalog-parse-failed' }` |
| `vatRate` 1'den büyük (örn. 20 — yüzde değil ondalık beklenir) | KDV dahil fiyat astronomik olur | Adapter parse fn `parseVatRate`: `"20%"` → 0.20, `"%20"` → 0.20, `"20"` → 0.20 (heuristic) |
| `productCode` input ile farklı | Orchestrator yanlış UPSERT yapabilir | Adapter input `productCode`'u modifiye etmez — `target.productCode` aynen result'a kopyalanır |
| Result array'inde target sayısından az/fazla eleman | Orchestrator çıkışta sayım yanlış olur | Adapter her target için **tam bir result** push etmeli (ok=true veya ok=false). Boş/skip kabul değil. |
| Login fail edildi ama scrapeCatalog yine çağrıldı | Tüm result'lar `session-expired` veya `login-required` mode olur | Orchestrator garantisi: `login()` başarısız olursa `scrapeCatalog` çağrılmaz (006). Adapter `login()` exception fırlatırsa orchestrator catalog phase'i atlar. |

---

## Başarı kriterleri

Adapter `scrapeCatalog` implementasyonu **PASS** sayılır:

1. ✅ Sözleşme tipleri ile tam uyumlu (TypeScript strict + lint geçer).
2. ✅ ≥5 ürün için cache miss durumunda doğru `unitPriceWithVat` döner (manuel doğrulama; ±0.01 ₺ tolerans).
3. ✅ İkinci koşumda cache hit ile **iki katı hızlı** çalışır (~3-5 sn vs ~10-15 sn).
4. ✅ DOM seçicisi kırıldığında (manuel test: selector geçersiz yapılarak) `catalog-parse-failed` mode ile **graceful** fail eder; orders phase etkilenmez.
5. ✅ Tek bir ürünün exception'ı diğer ürünleri durdurmaz.
6. ✅ Idempotency: aynı catalog scrape ardarda 2 kez çalıştırıldığında ikinci koşumda `summary.snapshots_added=0`.

---

## Referans implementasyon

**Reference**: `lib/scraper/adapters/enderyapi.ts:850-980` (`scrapeCatalog` function + helpers `navigateDirect`, `navigateBySearch`, `parsePriceFromLabel`, `parseVatRate`).

**Per-site farklılıklar**:
- İkizler: ASP.NET MVC controller pattern (`/Home/`, `/Urun/`). Detail page ID-based query (`?id=N`) veya code-based path (`/Urun/<code>`) olabilir.
- Levent Şimşek: PHP `?p=<action>` pattern. Detail page modal olabilir (008 leventsimsek modal pattern); modal ise selector'lar `div.modal.show` scope'unda.

**Common helpers reuse**: `navigateBySearch`, `parsePriceFromLabel`, `parseVatRate` adapter-local helpers olarak kopyalanır; **shared utils dosyası YOK** (V1; per-adapter constants kararı genişlerse refactor V2 scope).
