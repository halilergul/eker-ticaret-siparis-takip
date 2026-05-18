# Catalog DOM Discovery Contract: İkizler Hırdavat

**Site**: `http://bayi.ikizlerhirdavat.com`
**Protocol**: HTTP (plaintext — kabul edilmiş risk)
**Backend platform**: ASP.NET MVC (008'de keşfedildi)

Bu doküman İkizler **catalog detay sayfası** selector keşfi sırasında hangi sırayla deneyeceğini ve hangi başarı kriterlerinin geçeceğini tanımlar. 008'deki sipariş scrape pattern'i baz alınır; catalog phase için ek keşif.

---

## Bağlam (008'den)

- Login URL: `/Home/Giris`
- Form alanları: `input[name="KullaniciAdi"]`, `input[name="Parola"]`
- Sipariş listesi URL: `/Home/Belgeler?BelgeTipDetayID=134` (134 = sipariş filtresi)
- Sipariş detay URL: `/Home/BelgeDetay?BelgeID=<N>` veya benzeri

## Catalog URL keşfi (2026-05-17, T007 kullanıcı doğrulaması)

- **Catalog listesi**: `http://bayi.ikizlerhirdavat.com/Home/AramaSonuc?OzelFiltre=TumUrunler&KategoriAgacID=0`
- **Ürün detay**: `http://bayi.ikizlerhirdavat.com/Home/UrunDetay?ID=<numeric>` — ID-based; ürün kodundan deterministik üretilemez → search-then-detail zorunlu
- **Arama endpoint**: `/Home/AramaSonuc` — input parametresi (`Aranan` / `q` / `KelimeAra` / başka) diag script ile tespit edilecek
- Cache strategy: ilk koşum search ile ID-URL bulur → `products.catalog_url`'a yazar → ikinci koşum direkt navigate.

---

## Keşif Fazları

### Faz 0: Manuel browser exploration (10-15 dk)

1. Manuel login (Halil veya developer kendi hesabıyla).
2. Üst navigation menüsünde "Ürünler", "Katalog", "Stok Listesi" gibi link ara.
3. URL bar'a şu olasılıkları manuel yaz, hangisi yükleniyor:
   - `/Home/Urunler`
   - `/Home/Katalog`
   - `/Home/UrunListesi`
   - `/Urun/Index`
   - `/Stok/Liste`
4. Sipariş geçmişinden bilinen bir ürün koduyla (örn. 008 testindeki 61 item'dan biri) site arama yap:
   - Header'da arama kutusu (`<input type="search">`) var mı?
   - Submit URL'i ne? (`/Home/Arama?q=...`, `/Urun/Ara?kod=...`, vb.)
5. Bir ürünün detay sayfasını aç. URL pattern'i not:
   - `/Urun/Detay/<id>` mi? (ID-based)
   - `/Urun/<code>` mi? (code-based)
   - `?UrunID=<N>` mi? (query string)

**Çıktı**: `ikizler.constants.ts`'a eklenmek üzere:
```typescript
export const CATALOG_PATHS = ["/Home/Urunler", "/Home/Arama", ...];
export const SEARCH_INPUT_SELECTOR = 'input[name="q"]'; // veya keşfedilen
```

### Faz 1: Diag script (15-30 dk)

`scripts/scrape-diag/` altında geçici script:

```bash
npx tsx scripts/scrape-diag/diag-ikizler-catalog.ts -- --code "<SAMPLE-CODE>" --headed
```

Script görevleri:
1. Login (mevcut adapter login fonksiyonu reuse).
2. Search yap (Faz 0'da keşfedilen URL/selector ile).
3. Sonuç sayfasında ilk ürün linkine tıkla, detay sayfasını aç.
4. Tam sayfa screenshot dump: `scrape-debug/<runId>/ikizler-catalog-<code>.png`.
5. HTML dump: `scrape-debug/<runId>/ikizler-catalog-<code>.html`.

### Faz 2: Selector tespit (30-45 dk)

HTML dump'tan fiyat alanlarını bul. Beklentiler (ASP.NET MVC + Bootstrap kombinasyonu yaygın):

```html
<!-- Beklenen pattern A: tablo -->
<table class="detay-tablo">
  <tr><td>Liste Fiyatı</td><td>120,00 ₺</td></tr>
  <tr><td>İskonto</td><td>+%40+%12</td></tr>
  <tr><td>Net Fiyat (KDV Hariç)</td><td>54,56 ₺</td></tr>
  <tr><td>KDV</td><td>%20</td></tr>
</table>

<!-- Beklenen pattern B: span/div'lerle -->
<div class="fiyat-block">
  <span class="liste-fiyat" data-list-price="120">120,00 ₺</span>
  <span class="net-fiyat" data-net-price="54.56">54,56 ₺</span>
  <span class="kdv-orani" data-vat="20">%20</span>
</div>
```

`ikizler.constants.ts`'a eklenecek:

```typescript
export const CATALOG_FIELD_SELECTORS = {
  LIST_PRICE: [
    'td:has-text("Liste Fiyatı") + td',
    '.liste-fiyat',
    '[data-list-price]',
    'td.list-price',
  ],
  NET_EXCL_VAT: [
    'td:has-text("Net Fiyat") + td',
    'td:has-text("KDV Hariç") + td',
    '.net-fiyat',
    '[data-net-price]',
  ],
  VAT_RATE: [
    'td:has-text("KDV") + td',
    '.kdv-orani',
    '[data-vat]',
  ],
  DISCOUNT: [
    'td:has-text("İskonto") + td',
    '.iskonto',
    '[data-discount]',
  ],
  PRODUCT_NAME: [
    'h1.urun-adi',
    'h1',
    '.product-name',
  ],
};
```

**Selector öncelik sırası**: CSS class/id > Data attribute > Text-based fallback (son çare). Text-based içinde apostrof, Unicode tehlikeli — 006 ders kayıtlı.

### Faz 3: Search endpoint adapter helper (30 dk)

`ikizler.ts`'a yeni helper:

```typescript
async function navigateBySearch(ctx: ScrapeContext, code: string): Promise<string | null> {
  // 1. Header'daki arama kutusuna git veya search URL'ine direkt navigate
  const searchUrl = `${SITE_BASE_URL}/Home/Arama?q=${encodeURIComponent(code)}`;
  await ctx.page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

  // 2. İlk ürün card'ı yakala — başarısızsa null
  const firstResultSelectors = [
    'a[href*="/Urun/Detay"]',
    '.urun-card a',
    'table.sonuclar tbody tr:first-child a',
  ];

  for (const sel of firstResultSelectors) {
    const href = await ctx.page.locator(sel).first().getAttribute("href").catch(() => null);
    if (href) {
      const url = href.startsWith("http") ? href : `${SITE_BASE_URL}${href}`;
      await ctx.page.goto(url, { waitUntil: "domcontentloaded" });
      return url;
    }
  }

  return null; // search 0 sonuç
}
```

### Faz 4: `scrapeCatalog` implementasyonu (45-60 dk)

Enderyapı `enderyapi.ts:850-980` pattern'ini kopyala, ikizler-specific:
- `target.catalogUrl` varsa direkt navigate, başarısızsa search.
- Selector array'lerden ilk başarılıyı kullan (`readCell` helper).
- Parse fail → result.push({ ok: false, mode: 'catalog-parse-failed', ... }).
- Başarılı → `unitPriceWithVat` hesapla, result.push({ ok: true, ... }).

### Faz 5: Smoke test (15 dk)

```bash
npm run scrape:all -- --supplier ikizler --headed --verbose
```

**Beklenen çıktı**:
```
[scrape:all] Catalog aşaması: N yeni snapshot, 0 hata
```

**Başarı kriterleri**:
- ≥5 ürün için `snapshots_added` > 0.
- Manuel doğrulama: 3 ürünün `unit_price_with_vat` değeri B2B sitedeki KDV dahil özel fiyatla ±0.01 ₺ eşleşir.
- İkinci koşum: `snapshots_added = 0` (idempotency).

---

## ASP.NET MVC Spesifik Dikkatler

- **Session cookie**: `ASP.NET_SessionId` cookie — Playwright otomatik korur, ek iş yok.
- **Anti-forgery token**: Login'de form'da `__RequestVerificationToken` var (008'de doğrulandı). Catalog sayfası **GET** request olduğu için token gerekmez; ama search **POST** ise gerekebilir → form submit ile native flow yeterli.
- **Charset**: UTF-8 default (modern MVC). Sorun çıkmamalı.
- **Pagination**: Search sonuç sayfası pagination'lı olabilir; **V1'de ilk sayfa yeterli** (catalog scope sipariş'ten geldiği için tek arama tek sonuç eşleştirmesi yeterli).

---

## Selector Disiplini

- **CSS class/id-tabanlı öncelikli** (006 prensibi).
- Apostrof, çift tırnak içeren ürün adlarında text search **bypass edilmeli**.
- TR karakter (İ, ı, ş, ğ, ç, ö, ü) selector path'inde kullanılırsa selector encoding hatası riski → ASCII-safe CSS attribute selectors tercih.

---

## Failure Mode Eşleştirmesi

| Site davranışı | Adapter mode |
|---------------|--------------|
| Search 0 sonuç | `product-not-found` |
| Detail sayfası 404 | `network-error` |
| Detail sayfası açıldı ama fiyat field'ı yok | `catalog-parse-failed` |
| KDV oranı yok ama default %20 kabul | `ok: true, vatRate: 0.20` (R-005) |
| Login session expire | `session-expired` |
| Site 60sn cevap vermedi | `timeout` |

---

## DOM Değişimi Riski

İkizler MVC siteleri tipik olarak az güncellenir; selector'lar 6-12 ay stabil kalır. Selector kırılırsa run "Başarısız" + manuel düzeltme akışı: `--headed` keşif → constants güncelle → re-test.

---

## Çıktı Şeması

```typescript
ikizlerAdapter.slug === "ikizler"
ikizlerAdapter.displayName === "İkizler Hırdavat"
await ikizlerAdapter.login(ctx);  // 008'den
const orders = await ikizlerAdapter.listOrders(ctx);  // 008'den
const detail = await ikizlerAdapter.getOrderDetail(ctx, orders[0]);  // 008'den + opsiyonel catalogUrl
const results = await ikizlerAdapter.scrapeCatalog!(ctx, [{ productCode: "AR-1234" }]);
// results[0].ok === true; results[0].unitPriceWithVat > 0
```
