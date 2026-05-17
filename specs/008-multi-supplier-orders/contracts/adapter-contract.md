# Contract: Adapter Interface (sipariş scrape için)

**Source**: [`lib/scraper/types.ts`](../../../lib/scraper/types.ts) — `interface Adapter`

Bu kontrat, **yeni adapter'ın orchestrator (`scripts/scrape/all.ts`) tarafından çağrılırken sergileyeceği davranışı** tanımlar. Yapısal interface TypeScript tarafında zaten compile-time kontrol edilir; bu döküman **davranışsal** sözleşmeyi (idempotency, hata modu, side effect) yazılı kayıt altına alır.

## Adapter Module Yapısı

```typescript
// lib/scraper/adapters/<slug>.ts
export const <slug>Adapter: Adapter = {
  slug: "<slug>",                 // ör. "ikizler"
  displayName: "<Display Name>",  // ör. "İkizler Hırdavat"
  login,
  listOrders,
  getOrderDetail,
  getProductPrice,                // legacy; bu feature'da `return null`
  // scrapeCatalog → bu feature'da TANIMSIZ (009'a ertelendi)
};
```

Adapter `adapter-registry.ts`'e import + map'e eklenir:

```typescript
import { ikizlerAdapter } from "./adapters/ikizler";
import { leventsimsekAdapter } from "./adapters/leventsimsek";

export const adapters: Record<string, Adapter> = {
  enderyapi: enderyapiAdapter,
  ikizler: ikizlerAdapter,
  leventsimsek: leventsimsekAdapter,
};
```

## Metod 1: `login(ctx: ScrapeContext): Promise<void>`

**Sorumluluk**: Tedarikçi B2B sitesine authenticated session açar.

**Input**:
- `ctx.page` — yeni Playwright sayfa (boş, locale=tr-TR, timezone=Europe/Istanbul).
- Credentials `loadCredentials(slug)` ile `.env.local`/GH Secrets'tan okunur — adapter içinde değil, orchestrator'da değil; doğrudan `scripts/scrape/credentials.ts` import edilerek.

**Behavior**:
1. Login sayfasına navigate eder.
2. Username/password form alanlarını doldurur.
3. Submit → başarılıysa session cookie korunur.
4. Login sonrası `detectCaptcha(page)` ve `detect2FA(page)` çağrılır.
5. Başarı → return; başarısızlık → `throw new ScrapeError({ mode, step, details })`.

**Failure modes** (`FailureMode` union, `lib/scraper/errors.ts`):
- `"missing-credentials"` — env değişkeni yok.
- `"login-failed"` — username/password reject (form post sonrası "hatalı şifre" mesajı veya same-page kalma).
- `"captcha"` — login sayfasında captcha tespit edildi.
- `"2fa-required"` — 2FA prompt göründü.
- `"timeout"` — 60sn navigation timeout.
- `"unexpected-dom"` — login form selector'ları eşleşmedi (site DOM değişmiş).

**Guarantees**:
- Login başarılıysa `page.url()` login sayfasından farklı (redirect oldu).
- Credentials log/error mesajına **asla** sızmaz (FR-011); `details` field sadece "username/password reddedildi" gibi anonim metin içerir.
- Side effect: cookie session açıldı; `ctx.page` ileri metodlar için hazır.

## Metod 2: `listOrders(ctx: ScrapeContext, limit?: number): Promise<RawOrderSummary[]>`

**Sorumluluk**: Sipariş geçmişi sayfasını okur, sipariş özetlerini döner.

**Input**:
- `ctx.page` — authenticated.
- `limit` (opsiyonel) — en yeni N sipariş ile sınırla; verilmezse tüm tarih aralığı.

**Output**: `RawOrderSummary[]`:
```typescript
{
  orderNo: string;          // örn "S2025-001234" — site format'ı korunur
  status: string;           // örn "Onaylandı" — site terimleri olduğu gibi
  orderedAt: string;        // ISO 8601 datetime, parse edilmiş
  totalAmount: number;      // KDV dahil tutar (sitede gösterilen)
  detailUrl?: string;       // detay sayfasına direkt link (varsa)
}
```

**Behavior**:
1. Sipariş listesi sayfasına navigate.
2. Tablo/list satırlarını parse et.
3. Pagination varsa "Sonraki sayfa" izle (FR-005) — sayfa sayısı limiti yok ama infinite loop'a karşı 50 sayfa cap.
4. `limit` verilmişse satır sayısını kes.

**Failure modes**:
- `"empty-history"` — kullanıcı yeni hesap, sipariş yok. **Hata değil**: boş array dön (`[]`). Run "Başarılı" kalır. Spec edge case 6.
- `"unexpected-dom"` — tablo selector'u eşleşmedi.
- `"timeout"` — sayfa açılmadı.
- `"parse-failed"` — satır parse edilemedi (tarih veya tutar invalid format).

**Guarantees**:
- Tarih ISO string olarak döner (UTC veya offset belirli). TR format `DD.MM.YYYY` parse edilir.
- `orderNo` benzersiz **tedarikçi içinde**; farklı tedarikçilerde aynı orderNo olabilir (DB schema `UNIQUE (supplier_id, order_no)` ile koruyor).
- `totalAmount` parse hatası varsa 0 değil **`NaN` veya throw** — sessizce 0'a düşürme yok.

## Metod 3: `getOrderDetail(ctx: ScrapeContext, order: RawOrderSummary): Promise<RawOrderDetail>`

**Sorumluluk**: Tek bir siparişin detay sayfasını açar, ürün satırlarını ayıklar.

**Input**:
- `ctx.page` — authenticated.
- `order` — `listOrders`'tan gelen özet; `order.detailUrl` varsa direkt navigate, yoksa `orderNo` ile URL inşa edilir.

**Output**: `RawOrderDetail`:
```typescript
{
  summary: RawOrderSummary;  // input ile aynı (echo)
  items: RawOrderItem[];     // ürün satırları
}
```

`RawOrderItem`:
```typescript
{
  productCode: string;       // örn "PRD-12345" — site formatında
  productName: string;       // ürün adı (Türkçe karakter, parantez vb. korunur)
  quantity: number;          // adet (integer veya decimal — sitede gösterildiği gibi)
  unitPriceAtOrder: number;  // satır birim alış fiyatı (KDV dahil, sitede gösterilen)
  catalogUrl?: string | null; // ürün adı link ise; null geçilebilir
}
```

**Behavior**:
1. Detay sayfasına navigate.
2. Ürün satırlarını parse et (genelde `<table>` veya `<tr>`).
3. Boş tablo → `items: []` (sipariş iptal edilmiş olabilir, yine de header DB'ye yazılır).

**Failure modes**:
- `"unexpected-dom"` — detay tablosu yok.
- `"parse-failed"` — fiyat veya miktar parse edilemedi.
- `"timeout"`.

**Guarantees**:
- `productCode` parse edilemezse satır **atlanır** (warning push), tüm sipariş fail değil.
- `quantity` ve `unitPriceAtOrder` her zaman pozitif sayı (negatif tespit edilirse `parse-failed`).
- KDV dahil/hariç ayrımı: **mevcut konvansiyon KDV dahil değer saklamak** (Enderyapı pattern). Spec'te ayrıştırma istenmemiş.

## Metod 4: `getProductPrice(ctx, productCode): Promise<number | null>`

**Sorumluluk (bu feature'da)**: YOK. Placeholder.

**Implementation**:
```typescript
async function getProductPrice(): Promise<number | null> {
  return null;
}
```

**Rationale**: Interface zorunluluğu. Orchestrator `scripts/scrape/all.ts` bu metodu çağırmıyor. Catalog scrape 009'a ertelendi.

## Idempotency Garantisi

Adapter'lar **idempotent çağrım için stateless** olmalı:
- Aynı `listOrders` 2 kez → aynı sıralı sipariş listesi (site UI sırasını koruduğu sürece).
- DB write'lar `supabase-writer.ts` tarafında: `UNIQUE (supplier_id, order_no)` constraint → ikinci çağrım `orders_skipped: 10` döner.

Adapter kendisi **hiçbir DB write yapmaz**; yalnızca `Raw*` objeler döner. Orchestrator ve `supabase-writer.ts` write'lardan sorumlu.

## Logging Disiplini

- `ctx.verbose` true ise `process.stderr.write("[<slug>] ...")` ile log.
- **Credentials kesinlikle log'lanmaz** (FR-011). `console.log(creds)` veya `JSON.stringify(creds)` yasak — type system bunu garantilemez, adapter geliştiricinin sorumluluğunda.
- Debug screenshot `ctx.debugDir`'e atılır; `scrape-debug/<runId>/<step>.png` pattern'i.

## Concurrency

Tek adapter aynı anda **tek bir page instance** ile çalışır (`ctx.page`). Adapter içinde `Promise.all` ile paralel navigate **yasak** — Playwright tek sayfa context'te race condition yaratır.

GitHub Actions workflow seviyesinde `concurrency.group: scrape-${supplier}` farklı adapter'ları paralel runner'da çalıştırır (Constitution G16 garanti).

## Hata Çıkış Kodu (Adapter Sorumluluğu Dışında)

Adapter sadece `ScrapeError({ mode, step, details })` fırlatır. Çıkış kodu mapping orchestrator'da:
- `login-failed | 2fa-required | captcha` → exit 3 (auth issues, retry farklı)
- diğer hatalar → exit 1
- partial run → exit 0 (success bayrağıyla)
- global timeout → exit 4

Adapter geliştiricinin doğru `mode` etiketini seçmesi → run summary'sinde anlamlı görünür (G15 disiplin).
