# scripts/scrape/

CLI scrape script'leri. Şu an sadece **enderyapi PoC** (feature 002).

## İlk kurulum

```bash
# 1. Bağımlılıklar zaten package.json devDeps'inde (playwright, tsx, dotenv).
#    npm install yapıldıysa atla.
npm install

# 2. Chromium binary indir (bir kez)
npx playwright install chromium
```

## Çalıştırma

```bash
# Default: headless + düz metin çıktı
npm run scrape:enderyapi

# JSON çıktı
npm run scrape:enderyapi -- --json

# Görsel debug (browser pencere açılır)
npm run scrape:enderyapi -- --headed

# Detaylı log
npm run scrape:enderyapi -- --verbose

# Hepsi birlikte
npm run scrape:enderyapi -- --json --headed --verbose

# Yardım
npm run scrape:enderyapi -- --help
```

## Env vars (`.env.local`)

```bash
ENDERYAPI_USERNAME=halil@eker.com.tr
ENDERYAPI_PASSWORD=<gerçek-şifre>
```

`.env.local` gitignored; kimlik bilgileri makinende kalır.

## Çıktı

### Düz metin (default)

```
Ürün: Çelik İnşaat Demiri Ø12mm × 12m
Sipariş tarihi: 2026-04-23
Alış birim fiyatı: 142.50 ₺
Güncel birim fiyat: 156.00 ₺

(N sipariş bulundu, ilk sayfa, tek deneme)
```

### JSON (`--json`)

```json
[
  {
    "product_name": "...",
    "order_date": "...",
    "purchase_unit_price": 142.50,
    "current_unit_price": 156.00,
    "currency": "TRY"
  }
]
```

## Exit codes

| Code | Anlam |
|------|-------|
| 0 | Başarı (sipariş listesi parse edildi VEYA sipariş geçmişi boş) |
| 1 | Hata |
| 2 | Kullanım hatası (bilinmeyen flag) |

## Hata mesajları ve troubleshooting

| Mesaj başlangıcı | Anlam | Yapılacak |
|------------------|-------|-----------|
| `ENDERYAPI_USERNAME ve/veya ENDERYAPI_PASSWORD .env.local'da tanımlı değil` | Env eksik | `.env.local`'a iki değişkeni ekle |
| `Login başarısız: geçersiz kullanıcı adı veya şifre` | Kimlik doğrulama başarısız | Şifreyi kontrol et; Supabase'deki gibi büyük/küçük harf hassas |
| `CAPTCHA / bot koruması algılandı (tip: ...)` | Site botu tespit etti | Browser extension yaklaşımına yönel veya stealth plugin ekle (kapsam dışı) |
| `2FA gerekli — PoC kapsam dışı` | İki faktörlü auth açık | Site ayarlarından 2FA'yı kapat veya scraper'a 2FA desteği ekle (kapsam dışı) |
| `Ağ hatası: ...` | İnternet yok veya site cevap vermiyor | Bağlantıyı kontrol et |
| `Sayfa yapısı değişmiş: <adım>` | Selector tutmuyor, DOM değişmiş veya beklediğimizden farklı | Headed mode ile sayfayı incele, `scripts/scrape/constants.ts`'teki selector array'ini güncelle |
| `İşlem zaman aşımı (60sn)` | 60 saniyede bitmedi | Site yavaş veya sonsuz döngü var; --headed --verbose ile ne olduğunu izle |
| `Sipariş geçmişi boş` | Hesabın siparişi yok | Bu success (exit 0); script doğru çalıştı, veri yoktu |

## Hata anı screenshot'ları

Her hata anında `scrape-debug/<ISO-timestamp>-<mode>.png` kaydedilir.

```bash
ls -lh scrape-debug/
open scrape-debug/2026-05-16T20-30-45-login-failed.png   # macOS
```

Klasör gitignored. Boşaltabilirsin: `rm -rf scrape-debug/`.

## Dosya yapısı

```
scripts/scrape/
├── enderyapi.ts        CLI entry point — main()
├── constants.ts        URL'ler, selector aday array'leri, hata mesajları
├── credentials.ts      .env.local okuma + zod validation
├── price-parse.ts      TR locale fiyat parser ("1.234,56 ₺" → 1234.56)
├── output.ts           OrderLine type + formatText/formatJson
├── errors.ts           ScrapeError class + formatError
├── detection.ts        Captcha/2FA/DOM detection helpers
└── README.md           Bu dosya
```

## Mimari notlar

- **Standalone:** Script Next.js'in `app/` veya `lib/` ağacına bağımlı değil. `tsx`'le doğrudan çalışır.
- **PoC sapması:** CONSTITUTION'da multi-site adapter mimarisi tanımlı; bu PoC tek-amaçlı, abstract interface yok. Feature 004'te `lib/scraper/adapters/`'a refactor edilecek.
- **Şifre güvenliği:** Hiçbir log, stderr, screenshot dosya adı, stack trace şifreyi göstermez. FR-019 sözleşmesi.

## Feature 002 spec referansı

- Spec: [`specs/002-enderyapi-scraper-poc/spec.md`](../../specs/002-enderyapi-scraper-poc/spec.md)
- Quickstart (manuel test): [`specs/002-enderyapi-scraper-poc/quickstart.md`](../../specs/002-enderyapi-scraper-poc/quickstart.md)
