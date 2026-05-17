# DOM Discovery Contract: İkizler Hırdavat

**Site**: `http://bayi.ikizlerhirdavat.com` — `/Home/Giris` (login giriş noktası)
**Protocol**: **HTTP** (HTTPS değil) — credential plaintext riski kabul edilmiş.
**Backend platform tahmini**: ASP.NET MVC (URL pattern `/Controller/Action`).

Bu doküman selector keşfi sırasında **hangi sırayla deneneceğini ve hangi başarı kriterlerinin geçeceğini** tanımlar.

## Keşif Fazları

### Faz 0: Manuel browser açılışı (5 dk)

1. Chromium'da `bayi.ikizlerhirdavat.com/Home/Giris` aç.
2. DevTools açık — Network tab + Elements tab.
3. Manuel login dene (kullanıcı kendisi yapar): username + password gir, Submit.
4. Şu notlar tutulur:
   - Login form `<form>` `action` URL'si (örn `/Home/Giris` veya `/Account/Login`?).
   - Username input `name=` attribute (`UserName`, `username`, `email` adayları).
   - Password input `name=` attribute (`Password`, `password`, `sifre` adayları).
   - `__RequestVerificationToken` hidden input **var mı**? (ASP.NET MVC default).
   - Submit butonu CSS class veya id.
   - Login sonrası redirect URL (örn `/Home/Index`, `/Bayi/Anasayfa`?).

### Faz 1: Login adapter prototip (15 dk)

`lib/scraper/adapters/ikizler.ts` ve `ikizler.constants.ts` yarat. İlk versiyon **sadece login**. Test komutu:

```bash
npm run scrape:all -- --supplier ikizler --skip-catalog --headed --verbose --limit 0
```

`--limit 0` sipariş okumayı atlayacak (orchestrator iç akışı kontrol et: `limit=0` listOrders'ı çağırır ama 0 satırla return) → sadece login doğrulaması.

Başarı kriteri: `[scrape:all] ✓ Login başarılı` mesajı + `scrape-debug/<runId>/login-success.png` ekran görüntüsü ana paneli gösteriyor olmalı.

### Faz 2: Sipariş listesi keşfi (30 dk)

1. Login sonrası elle "Siparişlerim" linkine tıkla → URL'yi not et.
2. Sayfanın HTML kaynağını incele:
   - Sipariş satırları `<table>` mi, `<div>` cards mı?
   - `tr` (table row) selector'ı yeterli mi yoksa `.order-row`, `[data-order-id]` gibi class gerekir mi?
   - Pagination var mı? (50+ sipariş varsayımıyla)
   - Sayfa bölme: query string mi (`?page=2`) yoksa AJAX mı?

3. Selector array oluştur:
```typescript
// ikizler.constants.ts
export const ORDER_LIST_SELECTORS = {
  ROW_CONTAINERS: [
    'table.orders-table tbody tr',    // muhtemel ASP.NET scaffold
    '[class*="siparis" i]',
    '[class*="order" i]',
    'table tbody tr',                  // fallback
  ],
  COLUMNS: {
    ORDER_NO: ['td:nth-child(1)', '[class*="order-no"]'],
    DATE: ['td:nth-child(2)', '[class*="tarih"]'],
    STATUS: ['td:nth-child(3)', '[class*="durum"]'],
    TOTAL: ['td:nth-child(4)', '[class*="tutar"]'],
    DETAIL_LINK: ['a[href*="detay" i]', 'a[href*="order" i]'],
  },
};
```

### Faz 3: Sipariş detay keşfi (30 dk)

1. Bir siparişe tıkla → detail URL pattern'ini not et (`?id=N` query? `/siparis-detay/N`?).
2. Ürün satırlarını incele:
   - Ürün kodu hücresi class'ı.
   - Ürün adı (link mi text mi?).
   - Miktar / birim fiyat hücresi.

3. Selector array oluştur (örnek):
```typescript
export const ORDER_DETAIL_SELECTORS = {
  ITEM_ROWS: ['table.items tbody tr', '[class*="item-row"]', 'table tbody tr'],
  COLUMNS: {
    PRODUCT_CODE: ['td:nth-child(1)', '[class*="kod"]'],
    PRODUCT_NAME: ['td:nth-child(2)', '[class*="urun-adi"]'],
    QUANTITY: ['td:nth-child(3)', '[class*="adet"]'],
    UNIT_PRICE: ['td:nth-child(4)', '[class*="fiyat"]'],
  },
};
```

### Faz 4: End-to-end smoke (20 dk)

```bash
npm run scrape:all -- --supplier ikizler --skip-catalog --headed --verbose
```

Beklenen çıktı:
- `[scrape:all] N sipariş bulundu` (N > 0)
- DB'de `supplier_orders` tablosunda yeni satırlar (`supplier_id` = ikizler'inki)
- DB'de `order_items` tablosunda ürün satırları
- `scrape-debug/<runId>/` altında her sipariş için 1 screenshot

İkinci kez aynı komut çalıştır → `orders_skipped: N, orders_inserted: 0` (idempotency).

## Selector Disiplini

- **CSS class/id-tabanlı öncelikli**, text-tabanlı son çare. 006 deneyimi: Unicode apostrof `’` vs `'` Türkçe siteler arasında değişiyor → `has-text` kırılır.
- Birden fazla aday selector havuzdan: `tryFindSelector` enderyapı pattern'i (`return first match`).
- Selector havuzu `<slug>.constants.ts` dosyasında readonly tuple olarak. Adapter selector değiştirmez, sadece eşleşeni bulur.

## Failure Mode Eşleştirmesi

| Site davranışı | Mode |
|---------------|------|
| Login form bulunamadı | `unexpected-dom` (step: `login-form-locate`) |
| Kullanıcı/şifre reddedildi (same-page kalma + "Hatalı" mesajı) | `login-failed` |
| Login sonrası captcha sayfası | `captcha` |
| Sipariş listesi tablosu bulunamadı | `unexpected-dom` (step: `order-list-parse`) |
| Tek sipariş satırı parse hatası | warning (run continue) |
| Site cevap vermiyor (60sn) | `timeout` |

## DOM Değişimi Riski

Adapter selector'ları **kırılgan**. Site UI güncellemesi → run "Başarısız" + `selector-not-found` görünür. Bu durumda:
1. Geliştirici `--headed` ile siteyi açar.
2. Yeni selector tespit eder.
3. `ikizler.constants.ts`'i günceller.
4. Re-test.

Bu döngü mevcut adapter mimarisi kapsamında — yeni bir minor feature gerektirmez (sadece config commit).

## Beklenen Çıktı Şeması

Adapter implementasyonu tamamlandığında bu kontrat aşağıdakileri gerçeklemiş olur:

```typescript
ikizlerAdapter.slug === "ikizler"
ikizlerAdapter.displayName === "İkizler Hırdavat"
await ikizlerAdapter.login(ctx)              // sessizce return
const orders = await ikizlerAdapter.listOrders(ctx)
// orders: Array<RawOrderSummary> — site sipariş geçmişindeki tüm satırlar
const detail = await ikizlerAdapter.getOrderDetail(ctx, orders[0])
// detail.items: Array<RawOrderItem> — siparişin tüm satırları
await ikizlerAdapter.getProductPrice(ctx, "any-code")  // → null
```
