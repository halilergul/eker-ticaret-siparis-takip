# DOM Discovery Contract: Levent Şimşek Armatür

**Site**: `https://liste.leventsimsekarmatur.com/index.php`
**Protocol**: **HTTPS** ✓
**Backend platform tahmini**: PHP (URL `index.php` + query string).

Bu doküman selector keşfi sırasında **hangi sırayla deneneceğini ve hangi başarı kriterlerinin geçeceğini** tanımlar.

## Keşif Fazları

### Faz 0: Manuel browser açılışı (5 dk)

1. Chromium'da `liste.leventsimsekarmatur.com/index.php` aç.
2. Anasayfa: login formu doğrudan var mı, yoksa "Giriş" linki mi?
3. DevTools açık — Network tab + Elements tab.
4. Manuel login dene (kullanıcı kendisi): username + password gir.
5. Şu notlar tutulur:
   - Form `action` URL'si (`index.php?action=login`, `index.php?p=login` gibi PHP pattern'leri).
   - Username input `name=` (`username`, `email`, `kullanici_adi` adayları).
   - Password input `name=` (`password`, `sifre`).
   - CSRF token (PHP framework Laravel/Symfony kullanıyorsa `_token` hidden input olabilir).
   - Submit butonu (genelde `<button type="submit">`).
   - Login sonrası redirect veya same-page render (PHP'de form action sonrası `header("Location: ...")` yaygın).

### Faz 1: Login adapter prototip (15 dk)

`lib/scraper/adapters/leventsimsek.ts` ve `leventsimsek.constants.ts` yarat. İlk versiyon **sadece login**:

```bash
npm run scrape:all -- --supplier leventsimsek --skip-catalog --headed --verbose --limit 0
```

Başarı kriteri: `[scrape:all] ✓ Login başarılı` + `scrape-debug/<runId>/login-success.png` ana paneli gösteriyor.

### Faz 2: Sipariş listesi keşfi (30 dk)

1. Login sonrası elle "Siparişlerim" / "Sipariş Geçmişi" linkini bul → URL'yi not et.
   - PHP pattern: `index.php?action=siparisler`, `index.php?p=orders` gibi.
2. Sayfa kaynağını incele:
   - PHP siteler genelde `<table>` scaffold kullanır.
   - Class isimleri Bootstrap-like olabilir (`table table-striped`).
   - Pagination: yaygın `?page=N` PHP pattern'i.

3. Selector array oluştur:
```typescript
// leventsimsek.constants.ts
export const ORDER_LIST_SELECTORS = {
  ROW_CONTAINERS: [
    'table.orders tbody tr',
    'table.table tbody tr',
    '[class*="siparis" i]',
    'table tbody tr',
  ],
  COLUMNS: {
    ORDER_NO: ['td:nth-child(1)', '[class*="no"]'],
    DATE: ['td:nth-child(2)', '[class*="tarih"]'],
    STATUS: ['td:nth-child(3)', '[class*="durum"]'],
    TOTAL: ['td:nth-child(4)', '[class*="tutar"]'],
    DETAIL_LINK: ['a[href*="detay" i]', 'a[href*="goster" i]', 'a[href*="view"]'],
  },
};
```

### Faz 3: Sipariş detay keşfi (30 dk)

1. Bir siparişe tıkla → URL pattern'i not (`index.php?action=siparis_detay&id=N` muhtemel).
2. Ürün satırı parse:
   - **Önemli**: armatür ürünleri olduğu için ürün adları **Türkçe karakter + yabancı parça kodu** içerebilir (örn `1/2" Bakır Dirsek`). Apostrof + tırnak işaretleri parse risk noktası.
3. Selector array:
```typescript
export const ORDER_DETAIL_SELECTORS = {
  ITEM_ROWS: ['table.items tbody tr', 'table.table tbody tr', 'table tbody tr'],
  COLUMNS: {
    PRODUCT_CODE: ['td:nth-child(1)', '[class*="kod"]'],
    PRODUCT_NAME: ['td:nth-child(2)', '[class*="ad"]', '[class*="urun"]'],
    QUANTITY: ['td:nth-child(3)', '[class*="adet"]', '[class*="miktar"]'],
    UNIT_PRICE: ['td:nth-child(4)', '[class*="fiyat"]'],
  },
};
```

### Faz 4: End-to-end smoke (20 dk)

```bash
npm run scrape:all -- --supplier leventsimsek --skip-catalog --headed --verbose
```

Beklenen çıktı:
- `[scrape:all] N sipariş bulundu`
- DB'de `supplier_orders` (supplier_id=leventsimsek) yeni satırlar
- DB'de `order_items` ürün satırları
- İkinci kez çalıştır → `orders_skipped: N, orders_inserted: 0` (idempotency).

## PHP-Spesifik Dikkatler

- **Session cookie**: PHP genelde `PHPSESSID` cookie kullanır → Playwright otomatik korur, ek iş yok.
- **CSRF token**: Eğer form'da `_token` hidden input varsa Playwright `page.fill(...).click(submit)` ile native flow → token otomatik gönderilir, manuel okuma gerekmez.
- **Charset**: PHP siteler `<meta charset="utf-8">` ile UTF-8 default; ama eski sistemlerde `iso-8859-9` (Türkçe) görülebilir. Karakter bozuluyorsa `page.goto({ ... })` öncesi response encoding kontrol edilir.
- **AJAX vs full-page**: PHP siteler genelde server-side render → full page reload. Sayfa parse ederken `await page.waitForLoadState("domcontentloaded")` yeterli.

## Selector Disiplini

- **CSS class/id-tabanlı öncelikli**. Aynı 006 prensibi.
- Armatür ürün isimlerinde **çift tırnak, kesme işareti, slash** parse risk noktası — ürün adı string olarak DB'ye yazılırken Postgres UTF-8 / `text` columns güvenli, sorun yok.

## Failure Mode Eşleştirmesi

| Site davranışı | Mode |
|---------------|------|
| Login form bulunamadı | `unexpected-dom` (step: `login-form-locate`) |
| Kullanıcı/şifre reddedildi | `login-failed` |
| PHP redirect login sayfasına geri attı | `login-failed` (URL kontrolü) |
| Sipariş listesi tablosu yok | `unexpected-dom` (step: `order-list-parse`) |
| Tek satır parse hatası | warning (run continue) |
| Site cevap vermiyor (60sn) | `timeout` |

## DOM Değişimi Riski

Levent Şimşek site UI'sı az değişiyor (PHP siteler genelde stabil) — yine de kırılganlık aynı. Düzeltme akışı: `--headed` keşif → constants güncelle → re-test.

## Beklenen Çıktı Şeması

```typescript
leventsimsekAdapter.slug === "leventsimsek"
leventsimsekAdapter.displayName === "Levent Şimşek Armatür"
await leventsimsekAdapter.login(ctx)
const orders = await leventsimsekAdapter.listOrders(ctx)
const detail = await leventsimsekAdapter.getOrderDetail(ctx, orders[0])
await leventsimsekAdapter.getProductPrice(ctx, "any-code")  // → null
```
