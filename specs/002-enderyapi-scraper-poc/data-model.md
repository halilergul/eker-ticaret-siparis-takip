# Phase 1 — Data Model: Enderyapi Scraper PoC

**Date**: 2026-05-16

Bu feature **veritabanına yazmaz**. Aşağıdaki entity yalnızca **çalışma süresince in-memory** olarak yaşar; stdout'a (text veya JSON) basıldıktan sonra ortadan kaybolur. Persist yok.

---

## Entity 1: `OrderLine` (in-memory, ephemeral)

Sipariş geçmişi sayfasındaki bir satırı + ürünün şu anki birim fiyatını birleştiren değer nesnesi.

### TypeScript şeması (kod karşılığı)

```ts
export type OrderLine = {
  product_name: string;
  order_date: string;            // ISO 8601 string, "YYYY-MM-DD" formatı tercih
  purchase_unit_price: number;   // TL, ondalıklı (örn. 1234.56)
  current_unit_price: number | null;  // null = ürün delisted veya stok dışı
  currency: "TRY";               // sabit
  notes?: string;                // "ürün artık listede değil", "stokta yok" gibi
};
```

### Alan açıklamaları + validation

| Alan | Tip | Validation | Kaynak |
|------|-----|------------|--------|
| `product_name` | `string` (non-empty) | `trim().length > 0` aksi takdirde "Sayfa yapısı değişmiş" hatası | Sipariş satırından (`getByRole('cell')` veya CSS) |
| `order_date` | `string` | ISO 8601 `YYYY-MM-DD` veya site formatı (parse edilebilir); boş ise yarıdan dönüşür | Sipariş satırı |
| `purchase_unit_price` | `number` | `parseTrPrice()` sonucu non-null + > 0; null ise satır skip (warning) | Sipariş satırı veya detay |
| `current_unit_price` | `number \| null` | `parseTrPrice()` sonucu; null kabul edilir (delisted) | Ürün detay sayfası |
| `currency` | `"TRY"` | Sabit literal; çoklu currency yok | Hard-coded |
| `notes` | `string?` | Opsiyonel; null-state'leri açıklamak için | Hesaplanmış |

### Validation kuralları

```ts
function isValidOrderLine(line: Partial<OrderLine>): line is OrderLine {
  return (
    typeof line.product_name === "string" && line.product_name.trim().length > 0 &&
    typeof line.order_date === "string" && line.order_date.length > 0 &&
    typeof line.purchase_unit_price === "number" && line.purchase_unit_price > 0 &&
    (line.current_unit_price === null || (typeof line.current_unit_price === "number" && line.current_unit_price >= 0)) &&
    line.currency === "TRY"
  );
}
```

**Eğer parse edilemeyecek bir satırla karşılaşılırsa:**
- Script crash etmez
- Stderr'e "Sipariş satırı X parse edilemedi: <neden>" warning'i basar
- Diğer satırlara devam eder
- Eğer **hiç** geçerli satır parse edilemezse → "Sayfa yapısı değişmiş: sipariş satır parse'ı tamamen başarısız" + screenshot + exit 1

### State transitions

OrderLine immutable; üretildikten sonra değişmez. Yaşam döngüsü:

```
[Sipariş satırı DOM'da]
       │
       ▼ parseOrderRow()
[Partial<OrderLine>]
       │
       ▼ ürün detay sayfasını ziyaret et + parseTrPrice(current price)
[OrderLine candidate]
       │
       ▼ isValidOrderLine() kontrolü
       ├─ geçerli ──► [OrderLine[] dizisine push]
       └─ geçersiz ─► stderr warning, skip
                      │
                      ▼
              [Tüm satırlar bitti]
                      │
                      ▼ formatOutput(orderLines, mode)
              [stdout: text veya JSON]
                      │
                      ▼
              [process.exit(0)]
```

---

## Entity 2: `ScrapeError` (in-memory, ephemeral)

Her failure mode için zenginleştirilmiş hata bilgisi. Script catch ettiğinde formatlanır.

### TypeScript şeması

```ts
export type FailureMode =
  | "missing-credentials"
  | "login-failed"
  | "captcha"
  | "2fa-required"
  | "network"
  | "unexpected-dom"
  | "timeout"
  | "empty-history"      // success case değil ama distinct
  | "cookie-banner-block"
  | "unknown";

export type ScrapeError = {
  mode: FailureMode;
  message: string;          // Türkçe, kullanıcıya gösterilir
  details?: string;         // İç debug bilgisi (verbose mode'da basılır)
  screenshot_path?: string; // FR-013: scrape-debug/<ts>-<mode>.png
  step?: string;            // hangi adımda olduğu (örn. "login", "navigate-orders", "parse-row-3")
};
```

### Mode → Mesaj eşleme tablosu (FR-012, FR-014, FR-015)

| `mode` | TR Mesaj | Exit code | Screenshot? |
|--------|----------|-----------|-------------|
| `missing-credentials` | "ENDERYAPI_USERNAME ve/veya ENDERYAPI_PASSWORD .env.local'da tanımlı değil" | 1 | Hayır |
| `login-failed` | "Login başarısız: geçersiz kullanıcı adı veya şifre" | 1 | Evet |
| `captcha` | "CAPTCHA tespit edildi (tip: \<reCAPTCHA / hCaptcha / Cloudflare / bilinmiyor\>)" | 1 | Evet |
| `2fa-required` | "2FA gerekli — PoC kapsam dışı (\<SMS/OTP/Authenticator\> alanı algılandı)" | 1 | Evet |
| `network` | "Ağ hatası: \<detay\>" (DNS, timeout, connection refused) | 1 | Hayır (sayfa yok) |
| `unexpected-dom` | "Sayfa yapısı değişmiş: \<adım — login form / sipariş listesi / ürün satırı\>" | 1 | Evet |
| `timeout` | "İşlem zaman aşımı (60sn) — \<son aktivite\>" | 1 | Evet |
| `empty-history` | "Sipariş geçmişi boş — parse edilecek satır yok" | **0** (success) | Hayır |
| `cookie-banner-block` | "Beklenmedik popup: cookie/KVKK onayı geçilemedi" | 1 | Evet |
| `unknown` | "Beklenmedik hata: \<error message\>" | 1 | Evet |

### State transitions

```
[Script start]
   │
   ├─ Env validation FAIL
   │   └─► ScrapeError { mode: "missing-credentials" } → stderr → exit 1
   │
   ├─ Browser launch
   │   │
   │   ├─ Navigation timeout / DNS fail
   │   │   └─► ScrapeError { mode: "network" } → stderr → exit 1
   │   │
   │   ├─ Bot/CAPTCHA detected
   │   │   └─► screenshot → ScrapeError { mode: "captcha" } → stderr → exit 1
   │   │
   │   ├─ Login form found ─► fill + submit
   │   │   │
   │   │   ├─ Hatalı kimlik
   │   │   │   └─► screenshot → ScrapeError { mode: "login-failed" } → exit 1
   │   │   │
   │   │   ├─ 2FA prompt
   │   │   │   └─► screenshot → ScrapeError { mode: "2fa-required" } → exit 1
   │   │   │
   │   │   └─ Başarılı login ─► sipariş listesine git
   │   │       │
   │   │       ├─ Sayfa yapısı beklenmedik
   │   │       │   └─► screenshot → ScrapeError { mode: "unexpected-dom" } → exit 1
   │   │       │
   │   │       ├─ Sayfa boş (sipariş yok)
   │   │       │   └─► ScrapeError { mode: "empty-history" } → stderr warning → exit 0
   │   │       │
   │   │       └─ Satırlar parse edilir ─► OrderLine[] üretilir
   │   │           │
   │   │           └─► formatOutput → stdout → exit 0
   │
   └─ 60sn aşılırsa (her noktadan)
       └─► ScrapeError { mode: "timeout" } → screenshot → stderr → exit 1
```

---

## Persist edilen veri

**Yok.** PoC'un anti-pattern'ı budur — hiçbir yere yazmıyoruz.

Tek istisna: `scrape-debug/<timestamp>-<mode>.png` screenshot'ları (sadece hata durumunda, gitignored, kullanıcı silebilir).
