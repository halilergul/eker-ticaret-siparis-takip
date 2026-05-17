# Contract — Catalog Scraper

**Feature**: 006-price-changes-dashboard | **Tarih**: 2026-05-17

Bu doküman 004 adapter mimarisinin **catalog scrape** moduyla nasıl genişleyeceğini, CLI orchestrator'ın nasıl çalışacağını tanımlar.

## 1. Adapter interface genişletmesi

`lib/scraper/types.ts` (mevcut, 004):

```ts
export type Adapter = {
  slug: string;
  login: (ctx: ScrapeContext) => Promise<void>;
  listOrders: (ctx: ScrapeContext, opts: ListOrdersOpts) => Promise<ScrapedOrder[]>;
  getOrderDetail: (ctx: ScrapeContext, orderRef: string) => Promise<ScrapedOrderDetail>;
  getProductPrice: (ctx: ScrapeContext, code: string) => Promise<number | null>;  // PoC kalıntı, 006'da
};
```

**Yeni 006 method**:

```ts
export type Adapter = {
  // ... mevcut
  scrapeCatalog: (
    ctx: ScrapeContext,
    productCodes: string[]
  ) => Promise<CatalogScrapeResult[]>;
};

export type CatalogScrapeResult = {
  productCode: string;
  // Başarılı parse:
  productName?: string;
  brand?: string;
  listPrice?: number | null;       // KDV hariç liste; null = sitede yazılmıyor
  discountText?: string | null;    // ör. "+40%+12%"
  unitPriceExclVat?: number;       // KDV hariç net özel fiyat
  vatRate?: number;                // 0.20 = %20
  unitPriceWithVat?: number;       // hesaplanmış: unitPriceExclVat * (1 + vatRate), 2 ondalık yuvarlama
  // Hata:
  error?: { mode: FailureMode; message: string };
};
```

`getProductPrice` deprecated; `scrapeCatalog` daha zengin döner.

## 2. Enderyapi adapter implementation

`lib/scraper/adapters/enderyapi.ts`'a method eklenir.

**URL pattern** (keşfedilecek — implementation sırasında, headed mode):
- Olasılık A: `/urun-detay/<productCode>` (slug temelli)
- Olasılık B: `/product?code=<productCode>` (query temelli)
- Olasılık C: search box + result click (zorunlu fallback)

**Parsing selectors** (keşfedilecek; aşağıdaki alanlar görünür — kullanıcı PoC'da doğruladı):

```
Stok: Var
Ürün Kodu: 118 049
Marka: SEGNAN
Kutu / Koli: 18
Birim: PK
Liste Fiyatı: 430 TL
İskonto: +40%+12%      ← badge text
KDV'siz Net Fiyat: 227,040 TL
KDV: 20%
```

Parse pseudo-code:

```ts
async function scrapeCatalog(ctx, productCodes) {
  const results: CatalogScrapeResult[] = [];
  for (const code of productCodes) {
    try {
      await ctx.page.goto(buildCatalogUrl(code), { waitUntil: 'networkidle' });
      // Stok kontrolü
      const stockEl = await ctx.page.locator('text=Stok').locator('..').textContent();
      // Ürün adı header'dan
      const productName = await ctx.page.locator('h1').first().textContent();
      // Liste fiyatı
      const listPriceRaw = await ctx.page.locator('text=Liste Fiyatı').locator('..').textContent();
      const listPrice = parseTrPrice(listPriceRaw);  // "430 TL" → 430
      // İskonto badge
      const discountText = await ctx.page.locator('[data-discount-badge], .badge-discount').textContent();
      // KDV'siz Net Fiyat
      const netExclRaw = await ctx.page.locator('text=KDV\'siz Net Fiyat').locator('..').textContent();
      const unitPriceExclVat = parseTrPrice(netExclRaw);  // "227,040 TL" → 227.04
      // KDV oranı
      const vatRaw = await ctx.page.locator('text=KDV').locator('..').textContent();
      const vatRate = parseVatRate(vatRaw);  // "20%" → 0.20

      const unitPriceWithVat = Number((unitPriceExclVat * (1 + vatRate)).toFixed(2));

      results.push({
        productCode: code,
        productName: productName?.trim(),
        brand: await parseBrand(ctx),
        listPrice,
        discountText: discountText?.trim() ?? null,
        unitPriceExclVat,
        vatRate,
        unitPriceWithVat,
      });
    } catch (err) {
      results.push({
        productCode: code,
        error: { mode: 'catalog-parse-failed', message: err.message },
      });
    }
  }
  return results;
}
```

**Robustluk**:
- Her ürün için bağımsız try/catch — bir ürünün hatası diğerlerini durdurmasın.
- `waitUntil: 'networkidle'` (Enderyapı SPA, 002 deneyiminden biliniyor).
- Locator selector'lar text-based + class-based fallback.
- Stok dışı ürün: `stockEl === "Yok"` → snapshot **yine yazılır** (fiyat değişti mi takip için) ama UI'da ileride "stokta yok" badge'i.

**TR sayı parser**: 005'in `parseTrPrice("227,040 TL")` → 227.04 (binlik nokta yok bu örnekte; "1.234,56 TL" → 1234.56). 002 PoC'tan yaklaşımı uyarla.

## 3. CLI orchestrator: `scripts/scrape/catalog.ts`

**Komut**:
```bash
npm run scrape:catalog -- --supplier enderyapi --limit 20
npm run scrape:catalog -- --supplier enderyapi --only-stale 24
npm run scrape:catalog -- --supplier enderyapi --product-code "118 049"
```

**Args parsing**: `process.argv.slice(2)` — 004'teki `parseArgs` helper reuse veya basit elle.

**Akış**:
```ts
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const supplier = args.supplier;
  const adapter = loadAdapter(supplier);  // 004'ten

  // 1. Hangi ürünleri scrape edeceğiz?
  let productCodes: string[];
  if (args.productCode) {
    productCodes = [args.productCode];
  } else {
    productCodes = await selectProductCodes({
      supplierSlug: supplier,
      limit: args.limit,
      onlyStaleHours: args.onlyStale,
    });
  }

  // 2. Run başlat (audit)
  const run = await startRun({
    supplierSlug: supplier,
    mode: 'catalog',
    targets: productCodes.length,
  });

  // 3. Browser launch + login (004 deseni)
  const ctx = await launchBrowser({ headless: !args.headed });
  await adapter.login(ctx);

  // 4. Scrape
  const results = await adapter.scrapeCatalog(ctx, productCodes);

  // 5. DB write
  let written = 0, failed = 0, skipped = 0;
  for (const r of results) {
    if (r.error) {
      failed++;
      continue;
    }
    try {
      await ensureProduct({ supplierSlug: supplier, code: r.productCode, ...r });
      await writePriceSnapshot({
        productCode: r.productCode,
        supplierSlug: supplier,
        unitPriceWithVat: r.unitPriceWithVat!,
        unitPriceExclVat: r.unitPriceExclVat,
        listPrice: r.listPrice,
        discountText: r.discountText,
        vatRate: r.vatRate,
        source: 'catalog',
      });
      written++;
    } catch (err) {
      failed++;
    }
  }

  // 6. Run finalize
  if (failed === 0) await succeedRun(run.id, { written, failed, skipped });
  else if (written > 0) await partialRun(run.id, { written, failed, skipped });
  else await failRun(run.id, { reason: 'all-failed' });

  // 7. Cleanup
  await ctx.browser.close();
  console.log(`✓ ${written} yazıldı / ${failed} hata / ${skipped} atlandı`);
}
```

## 4. Yeni supabase-writer fonksiyonları

`lib/scraper/supabase-writer.ts`'a eklenir:

```ts
export async function ensureProduct(params: {
  supplierSlug: string;
  code: string;
  productName?: string;
  brand?: string;
  vatRate?: number;
}): Promise<string /* productId */> {
  // 1) supplier_id lookup
  // 2) products UPSERT on (supplier_id, code) — eğer varsa name + brand + vat_rate UPDATE
  // 3) productId döner
}

export async function writePriceSnapshot(params: {
  productCode: string;
  supplierSlug: string;
  unitPriceWithVat: number;
  unitPriceExclVat?: number;
  listPrice?: number | null;
  discountText?: string | null;
  vatRate?: number;
  source: 'catalog' | 'order';
}): Promise<string /* snapshotId */> {
  // 1) productId lookup (ensureProduct'tan gelir tipik kullanımda)
  // 2) price_snapshots INSERT
}
```

Mevcut `getSupplierIdBySlug`, `writeOrderHeader` deseniyle aynı tarzda.

## 5. Ürün seçme stratejisi: `selectProductCodes`

```ts
async function selectProductCodes(opts: {
  supplierSlug: string;
  limit?: number;
  onlyStaleHours?: number;
}): Promise<string[]> {
  const supabase = getServiceClient();

  // 1) products tablosundaki tüm ürünler
  let query = supabase
    .from('products')
    .select('code, supplier:suppliers!inner(slug)')
    .eq('supplier.slug', opts.supplierSlug);

  if (opts.onlyStaleHours) {
    // Son snapshot N saatten eskiyse veya hiç yoksa
    // (subquery; raw SQL veya RPC; V1 basit yaklaşım: tüm ürünler + JS filter)
  }

  const { data } = await query;
  let codes = (data ?? []).map(r => r.code);

  // 2) order_items'tan ek kodlar (henüz products'a girmemişler)
  const { data: orderCodes } = await supabase
    .from('order_items')
    .select('product_code, order:supplier_orders!inner(supplier:suppliers!inner(slug))')
    .eq('order.supplier.slug', opts.supplierSlug);
  const orderCodeSet = new Set((orderCodes ?? []).map(r => r.product_code));
  codes = Array.from(new Set([...codes, ...orderCodeSet]));

  // 3) Limit
  if (opts.limit) codes = codes.slice(0, opts.limit);

  return codes;
}
```

## 6. Error modes

`scripts/scrape/errors.ts` mevcut (004) — yeni mode'lar eklenir:

```ts
export type FailureMode =
  | 'login-failed'
  | 'navigation-timeout'
  | 'parse-failed'
  | 'db-write-failed'
  | 'supplier-not-found'
  | 'catalog-parse-failed'        // YENİ — catalog detay sayfası parse hatası
  | 'product-not-found'           // YENİ — catalog'ta ürün 404
  | 'vat-rate-missing';           // YENİ — KDV oranı parse edilemedi
```

## 7. package.json script

```json
{
  "scripts": {
    "scrape": "tsx scripts/scrape/run.ts",
    "scrape:catalog": "tsx scripts/scrape/catalog.ts"
  }
}
```

## 8. Çıktı formatı (stdout)

```
[catalog-scrape] supplier=enderyapi limit=20
[catalog-scrape] login OK
[catalog-scrape] 20 ürün scrape edilecek
[catalog-scrape] ✓ 118 049 KANATLI ALÇIPAN DÜBELİ NO:2 → ₺272,45 (KDV %20)
[catalog-scrape] ✓ 097 YMK-GU1260L YMK GRİ UZUN ASMA KİLİT NO:60 → ₺65,47
[catalog-scrape] ✗ 999 NOT-EXIST → catalog-parse-failed: ürün bulunamadı
... 
[catalog-scrape] DONE: 19 yazıldı / 1 hata / 0 atlandı (toplam 124sn)
```

**Önemli**: B2B kimlik bilgileri (`ENDERYAPI_USERNAME/PASSWORD`) **asla** stdout'a, log dosyasına veya `scrape_runs.error_message`'a yazılmaz. 004 deseni korunur.

## 9. Test stratejisi (manuel)

[quickstart.md](../quickstart.md) QS-11 + QS-12'de doğrulanır:
- QS-11: tek ürün için `--product-code` ile koşum; DB'de snapshot oluşumu.
- QS-12: 5 ürün toplu scrape + UI `/dashboard/price-changes` empty state'in olumlu hale geçişi.
