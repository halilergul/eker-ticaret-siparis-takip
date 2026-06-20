# Adapter Interface Contract: Yedekler

**Plan**: [../plan.md](../plan.md)  
**Data Model**: [../data-model.md](../data-model.md)  
**Tarih**: 2026-06-04

Bu doküman Yedekler adapter'ının uyması gereken interface kontratlarını listeler. Mevcut `lib/scraper/types.ts:Adapter` interface'i Yedekler için aynen kullanılır; sadece adapter implementation'ı bu kontratı yerine getirir.

---

## Contract 1: Adapter Interface Compliance

**Interface**: `lib/scraper/types.ts → Adapter`

Yedekler adapter'ı şu alanları sağlar:

```typescript
export const yedeklerAdapter: Adapter = {
  slug: "yedekler",
  displayName: "Yedekler İnşaat",
  
  async login(ctx: ScrapeContext): Promise<void> {
    // 3-alanlı form: customerCode + userCode + password
    // loadYedeklerCredentials() helper'ı kullanır
    // Başarısızlıkta ScrapeError({ mode: "login-failed", step: "login", details })
  },
  
  async listOrders(ctx: ScrapeContext, limit?: number): Promise<RawOrderSummary[]> {
    // Sipariş geçmişi sayfasına navigate
    // Maks N (default tüm) siparişin summary'sini parse et
    // ON FAIL: pushError + return []
  },
  
  async getOrderDetail(ctx: ScrapeContext, order: RawOrderSummary): Promise<RawOrderDetail> {
    // Sipariş detayına navigate / modal aç
    // Items array'ini parse et (productCode, productName, quantity, unitPriceAtOrder)
    // ON FAIL: pushError + return { summary, items: [] }
  },
  
  async getProductPrice(ctx: ScrapeContext, productCode: string): Promise<number | null> {
    // Tek bir ürünün güncel fiyatını al (opsiyonel — orders fiyat doğrulamada kullanılabilir)
    // Catalog scrape varsa bu az kullanılır
    // ON NOT FOUND: return null
  },
  
  // P2'de implement edilir
  async scrapeCatalog?(ctx: ScrapeContext, targets: CatalogScrapeTarget[]): Promise<CatalogScrapeResult[]> {
    // Catalog sayfasından (veya targets'ı list'leme) her ürün için snapshot result döndür
    // ON FAIL per item: { ok: false, productCode, mode, message }
  }
};
```

**Doğrulama**:
- TypeScript compile başarılı (interface uyumsuzluğu compile-time hata verir)
- `adapter-registry.ts → adapters` map'ine eklenince `getAdapter("yedekler")` adapter'ı döndürür

---

## Contract 2: Credentials Interface

**Yeni helper**: `scripts/scrape/credentials.ts → loadYedeklerCredentials()`

```typescript
export type YedeklerCredentials = {
  customerCode: string;
  userCode: string;
  password: string;
};

export function loadYedeklerCredentials(): YedeklerCredentials;
```

**Davranış**:
- `.env.local`'dan okur (gerektiğinde `dotenv.config()`)
- Üç değişken zorunlu: `YEDEKLER_CUSTOMER_CODE`, `YEDEKLER_USER_CODE`, `YEDEKLER_PASSWORD`
- Eksiklik: `ScrapeError({ mode: "missing-credentials", step: "env-load", details: "..." })`
- Değerleri **hiçbir yere log'lamaz** — error message yalnız değişken adlarını söyler
- zod schema ile validate edilir

**Doğrulama**:
- Boş env → ScrapeError fırlatır
- Tam env → 3 alanlı object döner
- `git log` ve `grep -r` ile değerlerin asla koda gömülmediği kontrol edilir

---

## Contract 3: Failure Mode Etiketleri

Yedekler adapter'ının fırlatabileceği `ScrapeError` mode'ları (mevcut `lib/scraper/errors.ts → FailureMode` union'ı):

| Mode | Anlam | Step Örnek |
|---|---|---|
| `missing-credentials` | Env eksik | `env-load` |
| `login-failed` | 3 alanlı form submit başarısız (yanlış kred, network, captcha) | `login` |
| `navigation-failed` | Sipariş listesi/detay sayfa açılamadı | `list-orders`, `order-detail` |
| `parse-failed` | DOM selector eşleşmedi veya format değişti | `parse-orders`, `parse-items`, `parse-catalog` |
| `timeout` | 5dk (veya override 8dk) doldu | `global` |
| `network` | HTTP error veya connection reset | `fetch-*` |
| `db-write-failed` | Supabase writer hatası | `write-order`, `write-item`, `write-snapshot` |

**Önemli**: `details` alanına credentials veya kişisel bilgi **YAZILMAZ**. Tipik içerik: "selector .xyz bulunamadı", "POST 500 received", "page.waitForSelector 30s timeout".

---

## Contract 4: Idempotency

Adapter doğrudan idempotency'den sorumlu değildir; **supabase-writer** layer'ı ON CONFLICT yönetir. Ancak adapter'ın doğru veri üretmesi gerekir:

| Idempotency Garantisi | Adapter Sorumluluğu |
|---|---|
| Aynı `order_no` bir kez insert | `RawOrderSummary.orderNo` sipariş için stable string olmalı (sipariş ID'si gibi) |
| Aynı `(supplier_id, code)` ürün bir kez insert | `RawOrderItem.productCode` ürün için stable kod olmalı (üretici kodu/SKU) |
| Aynı `(product_id, date, price)` snapshot bir kez insert | `CatalogScrapeResult.unitPriceExclVat` `Number(price.toFixed(2))` olmalı (009 decision) |

**Stable** = aynı tedarikçi datasında aynı semantic değer = aynı string. Adapter parse'ı raw HTML'den geliyor; whitespace/encoding normalize edilmeli.

---

## Contract 5: KDV Modeli

(006/009 ile aynı, hatırlatma)

- **Takip değişkeni**: KDV hariç net özel fiyat (Liste fiyatı × iskonto)
- **DB'de**: `unit_price_at_order` (orders) ve `unit_price` (snapshot) **KDV hariç** saklanır
- **Adapter sorumluluğu**: 
  - Eğer site KDV hariç gösteriyorsa direkt kullan
  - KDV dahil gösteriyorsa: `unit_price_excl_vat = priceWithVat / (1 + vatRate)` çevir
  - KDV oranı sayfadan okunamadıysa `vatRate = 0.20` default
- **UI tarafı**: KDV dahil tutar gerektiğinde `unit_price * (1 + vatRate)` hesaplar (zaten yapılıyor)

---

## Contract 6: Türkçe Karakter

(Constitution prensibi, hatırlatma)

- Tedarikçi adı, ürün adı, durum etiketi gibi text alanlar UTF-8 olarak saklanır
- Adapter HTML'den okurken character encoding tespit etmeli (response header'dan veya Playwright varsayılan)
- Ürün adında "Şimşek", "Çelik", "Ağaç" gibi karakterler **bozulmadan** DB'ye gitmeli
- Test: `INSERT ... VALUES ('Yedekler İnşaat')` sorunsuz; `SELECT name FROM suppliers WHERE slug='yedekler'` → `Yedekler İnşaat` (encoding değişmeden)

---

## Contract 7: Workflow Integration

**Modify**: `.github/workflows/scrape.yml`

- `workflow_dispatch.inputs.supplier.options`'a `- yedekler` eklenir
- `env:` bloğuna 3 yeni satır:
  ```yaml
  YEDEKLER_CUSTOMER_CODE: ${{ secrets.YEDEKLER_CUSTOMER_CODE }}
  YEDEKLER_USER_CODE: ${{ secrets.YEDEKLER_USER_CODE }}
  YEDEKLER_PASSWORD: ${{ secrets.YEDEKLER_PASSWORD }}
  ```
- `concurrency.group` ifadesi `'enderyapi'` default'unu değiştirmez (yedekler için ayrı concurrency grubu olur ki tedarikçiler birbirini bloklamasın — zaten mevcut)
- `timeout-minutes: 15` aynen kalır (8dk script + buffer)

**GitHub Repo Secrets** (kullanıcı manuel ekler):
- `YEDEKLER_CUSTOMER_CODE`
- `YEDEKLER_USER_CODE`
- `YEDEKLER_PASSWORD`

**Vercel Environment Variables** (workflow_dispatch trigger için):
- Aynı 3 secret

---

## Contract 8: Settings UI Integration

**Mevcut davranış**: `/dashboard/settings` sayfası `suppliers` tablosundan dinamik olarak TriggerCard'lar render eder.

**Yedekler için ek değişiklik gerekmez** — supplier seed'lendiği anda 4. kart otomatik görünür.

**Doğrulama**:
- `suppliers` tablosuna seed eklendikten sonra `/dashboard/settings` 4 kart göstermeli
- Layout (grid wrap) 4 kart için sığmalı; gözle kontrol

---

## Sonraki Adım

`adapter-interface.md` complete. `quickstart.md`'ye geçilir.
