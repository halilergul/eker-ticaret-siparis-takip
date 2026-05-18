# Catalog DOM Discovery Contract: Levent Şimşek Armatür

**Site**: `https://liste.leventsimsekarmatur.com`
**Protocol**: HTTPS ✓
**Backend platform**: PHP (008'de keşfedildi — `index.php?p=<action>`)

Bu doküman Levent Şimşek **catalog detay sayfası** selector keşfi sırasında hangi sırayla deneyeceğini ve hangi başarı kriterlerinin geçeceğini tanımlar.

---

## Bağlam (008'den)

- Login URL: `/?p/loginvendor` veya `?p=loginvendor` (her ikisi de denenir)
- Form alanları: `input[name="cusername"]`, `input[name="cpassword"]` (hidden navbar dropdown içinde)
- Login submit: `input[type="submit"][name="login"]` — DOM evaluate native value set + form.submit() pattern
- Sipariş listesi URL: `/?p=showorder&mode=normal`
- Sipariş detayı: **MODAL** olarak açılır (`Detaylar` butonu → `.modal.show` veya `[role="dialog"]`)
- 008'de **module-level `detailCache: Map<string, RawOrderItem[]>`** pattern kullanıldı — sipariş listesi okurken her satırın modal'ını açıp items'ı cache'liyoruz.

**Catalog endpoint: BİLİNMİYOR** — bu feature'da keşfedilecek. Levent Şimşek'in **bir catalog sayfası olmayabilir** (site adı "liste" → muhtemelen sipariş listesi odaklı). Bu durumda fallback stratejisi: order detail modal'ından alınan birim fiyatlar `source='order'` olarak `price_snapshots`'a zaten yazılıyor (006 davranışı) — catalog scrape ek değer üretmez ve adapter `scrapeCatalog` 0 sonuç döner.

---

## Keşif Fazları

### Faz 0: Manuel browser exploration (15-30 dk)

1. Manuel login.
2. Üst navigation menüsünde "Ürünler", "Katalog", "Liste", "Arama" gibi link ara.
3. URL bar'a şu olasılıkları yaz:
   - `/?p=showproducts`
   - `/?p=urun_listesi`
   - `/?p=urun_detay&id=N`
   - `/?p=showitems`
   - `/?p=urun&kod=<code>`
   - `/?p=search&q=<code>`
4. Site map kontrolü: `/?p=sitemap`, `/?p=index` — bilgilendirici link listesi varsa kontrol.
5. Sipariş detayı modal'ında ürün adı / kodu **link** mi?
   - Link ise: `href` attribute'unu yakala → catalog detay URL pattern'i çıkar.
   - Değilse: search yöntemi aranır.

**Beklenen sonuçlar**:
- **A**: Catalog endpoint var (`?p=urun_detay&id=N` veya benzeri) → standart pattern, Enderyapı/İkizler ile aynı yöntem.
- **B**: Catalog endpoint YOK → adapter `scrapeCatalog` 0 sonuç döner; veya **modal-only** pattern (ürün adına tıklamak modal açıyor).
- **C**: Search endpoint var (`?p=search&q=...`) → search-then-detail pattern.

### Faz 1: Diag script (15-30 dk)

```bash
npx tsx scripts/scrape-diag/diag-leventsimsek-catalog.ts -- --code "<SAMPLE-CODE>" --headed
```

Script görevleri:
1. Login (008'deki adapter login reuse — DOM evaluate ile gizli form).
2. Sipariş listesi modal'larından bilinen bir ürün kodu için catalog navigate dene.
3. Tam sayfa screenshot dump: `scrape-debug/<runId>/leventsimsek-catalog-<code>.png`.
4. HTML dump.
5. **Modal varsa**: modal HTML'ini de ayrı dump et (`-modal.html`).

### Faz 2: Selector tespit (30-60 dk)

#### Scenario A: Catalog endpoint var (full page)

Beklenen pattern (PHP + Bootstrap):

```html
<div class="urun-detay">
  <h2 class="urun-adi">PVC Bahçe Musluğu ½"</h2>
  <table class="fiyat-tablo">
    <tr><td>Liste Fiyatı</td><td>250,00 ₺</td></tr>
    <tr><td>İskonto</td><td>%35</td></tr>
    <tr><td>Net Fiyat</td><td>162,50 ₺</td></tr>
    <tr><td>KDV</td><td>%20</td></tr>
  </table>
</div>
```

`leventsimsek.constants.ts`'a eklenecek:

```typescript
export const CATALOG_FIELD_SELECTORS = {
  LIST_PRICE: [
    'td:has-text("Liste") + td',
    '.liste-fiyat',
    '[data-list-price]',
  ],
  NET_EXCL_VAT: [
    'td:has-text("Net Fiyat") + td',
    'td:has-text("Müşteriye Özel") + td',
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
  ],
  PRODUCT_NAME: [
    'h2.urun-adi',
    'h1',
    '.product-name',
  ],
};
```

#### Scenario B: Catalog yok, sadece sipariş modal'ı

`scrapeCatalog` 0 sonuç döner. Log: `"Levent Şimşek catalog endpoint bulunamadı; sipariş modal verisi 'source=order' ile snapshot olarak yazılıyor (008 davranışı)."`

Bu durumda Phase 1'de **kullanıcıyla netleştirme** yapılır: yine catalog scrape gerekli mi yoksa sipariş modal verisi yeterli mi?

#### Scenario C: Search endpoint

```typescript
async function navigateBySearch(ctx: ScrapeContext, code: string): Promise<string | null> {
  const searchUrl = `${SITE_BASE_URL}/?p=search&q=${encodeURIComponent(code)}`;
  await ctx.page.goto(searchUrl, { waitUntil: "domcontentloaded" });

  const firstResultSelectors = [
    'a[href*="p=urun_detay"]',
    '.urun-card a',
    'table tbody tr:first-child a',
  ];

  for (const sel of firstResultSelectors) {
    const href = await ctx.page.locator(sel).first().getAttribute("href").catch(() => null);
    if (href) {
      const url = href.startsWith("http") ? href : `${SITE_BASE_URL}/${href.replace(/^\//, "")}`;
      await ctx.page.goto(url, { waitUntil: "domcontentloaded" });
      return url;
    }
  }

  return null;
}
```

### Faz 3: `scrapeCatalog` implementasyonu (60 dk)

Enderyapı pattern'ini kopyala + Scenario'ya göre adapte et. **Önemli**: 008'deki modal pattern dikkatli kullan — `page.locator('.modal.show')` veya `[role="dialog"]` scope'unda field okumak gerekebilir.

```typescript
async function scrapeCatalog(ctx, targets) {
  // closeModalIfOpen helper 008'de zaten var — reuse
  await closeModalIfOpen(ctx);

  const results = [];
  for (const target of targets) {
    try {
      let resolvedUrl = null;
      if (target.catalogUrl) {
        const ok = await navigateDirect(ctx, target.catalogUrl);
        if (ok) resolvedUrl = target.catalogUrl;
      }
      if (!resolvedUrl) {
        resolvedUrl = await navigateBySearch(ctx, target.productCode);
      }
      if (!resolvedUrl) {
        results.push({ ok: false, productCode: target.productCode, mode: "product-not-found", message: "..." });
        continue;
      }

      // ... parse + push result
    } catch (err) {
      results.push({ ok: false, productCode: target.productCode, mode: "catalog-parse-failed", message: String(err) });
    }
  }
  return results;
}
```

### Faz 4: Smoke test (15 dk)

```bash
npm run scrape:all -- --supplier leventsimsek --headed --verbose
```

Beklenti aynı: ≥3 ürün için snapshot. Manuel doğrulama 2 ürün için fiyat eşleşmesi.

---

## PHP Spesifik Dikkatler

- **Session cookie**: `PHPSESSID` — Playwright otomatik korur.
- **Charset**: PHP siteler UTF-8 default; eski sistemlerde `iso-8859-9` görülebilir — TR karakter bozuluyorsa encoding kontrol.
- **CSRF**: Form submit'lerinde `_token` hidden input olabilir; Playwright native flow yeterli.
- **Modal-only katalog**: Modal scope'unda `page.locator('.modal.show ...')` kullan; Bootstrap modal "fade" sınıfı geçiş animasyonu için `await page.waitForSelector('.modal.show', { state: 'visible' })` gerekli.

---

## Modal vs Full-Page Davranışı

Eğer catalog detayı modal olarak açılıyorsa:

1. Catalog list sayfasına git.
2. Ürün kodu / adıyla eşleşen satırı bul; **tıklanabilir** mi kontrol et.
3. Tıkla → modal açılmasını bekle (`page.waitForSelector('.modal.show')`).
4. Modal scope'unda field selector'ları çağır.
5. Modal'ı kapat (`page.locator('.modal.show .close').click()` veya `Escape`).
6. Sonraki ürüne geç.

**`catalogUrl` modal durumunda ne olur?** Modal URL'ı yoktur (anchor `javascript:;` veya `data-target` ile çalışır). `result.catalogUrl` olarak sayfa URL'sini + ürün kodunu birleştir (örn. `${listUrl}#code=<code>`) → cache hit kontrolü adapter tarafında "URL == listUrl + #code=..." pattern'iyle yapılır. **Veya** cache hit pattern modal için disabled (her seferinde full search). V1'de basit kalsın → modal varsa **search-only** mode kabul edilir.

---

## Failure Mode Eşleştirmesi

| Site davranışı | Adapter mode |
|---------------|--------------|
| Catalog endpoint yok (Scenario B doğrulandı) | `catalog-not-supported` — VEYA adapter 0 sonuç döner, orchestrator anlamlı log |
| Search 0 sonuç | `product-not-found` |
| Modal açılmadı (timeout) | `unexpected-dom` (step: `catalog-modal-open`) |
| Fiyat field'ı bulunamadı | `catalog-parse-failed` |
| KDV yok ama default %20 kabul | `ok: true, vatRate: 0.20` |
| Login expire | `session-expired` |
| Site cevap vermiyor | `timeout` |

---

## DOM Değişimi Riski

Levent Şimşek site UI'sı 008 deneyimine göre stabil. PHP siteler genelde az güncellenir. Selector kırılırsa manuel düzeltme akışı: `--headed` keşif → constants güncelle → re-test.

---

## Çıktı Şeması

```typescript
leventsimsekAdapter.slug === "leventsimsek"
leventsimsekAdapter.displayName === "Levent Şimşek Armatür"
const results = await leventsimsekAdapter.scrapeCatalog!(ctx, targets);
// Scenario A doğrulanırsa: results.filter(r => r.ok).length === targets.length (search/cache başarılıysa)
// Scenario B doğrulanırsa: results.length === 0 (catalog yok, ama orders normal devam etti)
```

---

## Karar noktası (Faz 0 sonunda)

Faz 0 keşfinden sonra hangisinin doğru olduğu netleşir:

- **Scenario A (catalog var)**: Tam implementasyon, Enderyapı pattern'i.
- **Scenario B (yok)**: Bu adapter için `scrapeCatalog` minimal (boş döner) + kullanıcıya bilgilendirme; sipariş modal verisinden `source='order'` snapshot'ları zaten yazılıyor olduğu için "Zamlanan Ürünler" sayfası yine çalışır.
- **Scenario C (search-only)**: Implementasyon aynı, sadece `target.catalogUrl` cache hit asla olmaz (search her seferinde).

Karar noktası **plan + tasks** generation öncesi netleşmiyor → tasks.md'de "T-XX: Scenario tespiti + branch karar" görevi olarak işaretlenir.
