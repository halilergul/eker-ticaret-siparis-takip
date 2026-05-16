# Contract — Adapter Interface

**Feature**: 004-enderyapi-scraper-prod | **Tarih**: 2026-05-16

Bu doküman `lib/scraper/types.ts`'deki `Adapter` interface'in **kontratı**dır. Tüm B2B site adapter'ları (Enderyapi, gelecekteki diğerleri) bu sözleşmeye uymalıdır.

---

## Tip imzaları

```ts
import type { Page } from "playwright";
import { z } from "zod";

// Hata kategorileri (lib/scraper/errors.ts'den genişletilir)
export type FailureMode =
  | "login-failed"
  | "2fa-required"
  | "captcha-detected"
  | "missing-credentials"
  | "unexpected-dom"
  | "network-error"
  | "db-write-failed"
  | "supplier-not-found"
  | "unknown";

// Akış bağlamı — her adapter metoduna pas geçilir
export type ScrapeContext = {
  page: Page;
  supplierId: string;
  runId: string;
  verbose: boolean;
  debugDir: string;
  pushError(step: string, mode: FailureMode, detail: string): void;
};

// Sipariş listesinden okunan minimal veri
export type RawOrderSummary = {
  orderNo: string;
  status: string;
  orderedAt: string;       // ISO 8601
  totalAmount: number;
  detailUrl?: string;
};

// Sipariş detayından okunan tam veri
export type RawOrderItem = {
  productCode: string;
  productName: string;
  quantity: number;
  unitPriceAtOrder: number;
};

export type RawOrderDetail = {
  summary: RawOrderSummary;
  items: RawOrderItem[];
};

// Adapter sözleşmesi
export interface Adapter {
  readonly slug: string;
  readonly displayName: string;

  /** Login + session establishment. Hata: ScrapeError fırlat. */
  login(ctx: ScrapeContext): Promise<void>;

  /** Sipariş listesini oku. `limit` opsiyonel sınır (--limit CLI). */
  listOrders(ctx: ScrapeContext, limit?: number): Promise<RawOrderSummary[]>;

  /** Sipariş detayını + içindeki ürün satırlarını oku. Hata olursa ctx.pushError + throw. */
  getOrderDetail(ctx: ScrapeContext, order: RawOrderSummary): Promise<RawOrderDetail>;

  /** Ürün kataloğundan güncel fiyatı oku. Parse edilemezse NULL döner (hata değil). */
  getProductPrice(ctx: ScrapeContext, productCode: string): Promise<number | null>;
}

// Zod schema — runtime validation
export const scrapeSummarySchema = z.object({
  orders_total: z.number().int().nonnegative(),
  orders_inserted: z.number().int().nonnegative(),
  orders_skipped: z.number().int().nonnegative(),
  items_inserted: z.number().int().nonnegative(),
  items_skipped: z.number().int().nonnegative(),
  products_observed: z.number().int().nonnegative(),
  snapshots_added: z.number().int().nonnegative(),
  errors: z.array(z.object({
    step: z.string(),
    mode: z.string(),
    detail: z.string(),
    timestamp: z.string(),
  })),
});
export type ScrapeSummary = z.infer<typeof scrapeSummarySchema>;
```

---

## Davranış kuralları (her adapter uymalı)

### A1 — `login()` davranışı
- Başarılı login sonrası `ctx.page` authenticated session içinde olmalı.
- 2FA, CAPTCHA, login form hatası, geçersiz kimlik → `ScrapeError` fırlat (uygun mode).
- Hata sonrası `ctx.page.screenshot()` `<debugDir>/login-failed.png` olarak yazılır (PoC pattern).
- Kimlik bilgileri **hiçbir** stderr/stdout/screenshot dosya adı/exception mesajına yazılmaz.

### A2 — `listOrders()` davranışı
- En yeni sipariş başta sıralı dizi döner (UI'da "son sipariş" gösterimi için).
- `limit` parametresi verilmişse en yeni `limit` siparişle sınırlandırır.
- Sipariş listesi boş ise boş array döner (hata değil).
- Sayfa yapısı değişmişse `unexpected-dom` mode'lu ScrapeError.

### A3 — `getOrderDetail()` davranışı
- `order.detailUrl` set ise oraya gider; yoksa adapter kendi URL pattern'ından türetir.
- `items` boş olabilir (geçerli edge case, log'la geç).
- Network error → `network-error` mode + retry yok (orchestrator karar verir; V1'de skip + ctx.pushError).
- Tek sipariş hatası diğerlerini etkilememeli (orchestrator try/catch ile sarar).

### A4 — `getProductPrice()` davranışı
- Ürün katalog sayfasına gider.
- Fiyat parse edilirse `number` (TRY) döner.
- 404 (ürün katalogtan silinmiş), parse hatası, "stokta yok" → `null` döner (`ctx.pushError` ile log; hata fırlatma).
- Çağrılar arasında en az 500ms delay (rate-limit awareness).

### A5 — İdempotency garantisi (adapter perspektifi)
- Adapter'lar **veriyi çıkarır**; idempotency DB-writer'da değil burada zorunlu değildir.
- Aynı sayfayı iki kez ziyaret etmek serbest (sadece performans etkisi).

### A6 — Debug screenshot
- Her başarısız adımda `<debugDir>/<step>-failed.png` zorunlu.
- `verbose=true` ise her başarılı adımda da `<debugDir>/<step>-ok.png` opsiyonel.

---

## Test edilebilirlik kontratı (mock adapter)

Test ortamında adapter mock'lanabilmeli. Şu minimum mock yeterli:

```ts
const mockAdapter: Adapter = {
  slug: "mock",
  displayName: "Mock Supplier",
  async login() {},
  async listOrders() { return [/* fixture data */]; },
  async getOrderDetail(_, order) { return { summary: order, items: [] }; },
  async getProductPrice() { return 100; },
};
```

V1'de mock testleri zorunlu değil; ama interface bu mock'u sorunsuz destekler.

---

## EnderyapiAdapter spesifik notlar

- `slug = "enderyapi"`, `displayName = "Enderyapi B2B"`.
- `login()`: PoC'taki akış (URL change wait + networkidle); selector aday'ları PoC'tan korunur.
- `listOrders()`: `/tr` ana sayfa veya `/siparislerim` (PoC keşfetti).
- `getOrderDetail()`: `/tr/siparis-detay?id=<id>` URL pattern'ı; PoC keşfetti.
- `getProductPrice()`: **henüz keşfedilmedi** — implementation sırasında 1-2 selector iterasyonu beklenir. Pattern: katalog sayfası URL'i, fiyat span/div selector aday'ları.
