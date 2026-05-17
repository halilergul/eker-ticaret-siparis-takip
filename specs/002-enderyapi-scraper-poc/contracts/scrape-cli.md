# CLI Contract — `npm run scrape:enderyapi`

**Date**: 2026-05-16

PoC bir CLI script; "contract" yüzeyi: çalıştırma komutu, flag'ler, exit code'lar, stdout/stderr formatları, screenshot'lar. Bu doküman implementation'ın uyacağı sözleşmedir.

---

## Çalıştırma

```bash
npm run scrape:enderyapi              # default: headless, text output
npm run scrape:enderyapi -- --json    # JSON output (stdout)
npm run scrape:enderyapi -- --headed  # Browser görünür (debugging)
npm run scrape:enderyapi -- --verbose # Detaylı log (stderr'e)
npm run scrape:enderyapi -- --json --verbose --headed   # Hepsi birlikte
```

`package.json`:
```json
{
  "scripts": {
    "scrape:enderyapi": "tsx scripts/scrape/enderyapi.ts"
  }
}
```

---

## Input

### Env vars (REQUIRED, `.env.local`)

| Var | Tip | Kısıt |
|-----|------|-------|
| `ENDERYAPI_USERNAME` | string (non-empty) | Site'deki login form'un kabul ettiği format (email veya kullanıcı adı) |
| `ENDERYAPI_PASSWORD` | string (non-empty) | TR karakter destekli |

### CLI flags (OPTIONAL)

| Flag | Kısayol | Tip | Default | Açıklama |
|------|---------|-----|---------|----------|
| `--json` | `-j` | boolean | `false` | stdout JSON dizisi formatında basar |
| `--headed` | — | boolean | `false` | Browser pencereyi açar (default headless) |
| `--verbose` | `-v` | boolean | `false` | stderr'e adım-adım log basar |
| `--help` | `-h` | boolean | — | Kullanım metni stdout'a, exit 0 |

Bilinmeyen flag: stderr "Bilinmeyen flag: \<flag\>" + exit 2 (POSIX usage error).

---

## Output

### Default: Text (stdout)

Her sipariş satırı için 4 satır + satır arası boş satır:

```
Ürün: Çelik İnşaat Demiri Ø12mm × 12m
Sipariş tarihi: 2026-04-23
Alış birim fiyatı: 142.50 ₺
Güncel birim fiyat: 156.00 ₺

Ürün: Elektrikli Matkap Bosch GBM 13 RE
Sipariş tarihi: 2026-03-15
Alış birim fiyatı: 4250.00 ₺
Güncel birim fiyat: 4550.00 ₺

(2 sipariş bulundu, ilk sayfa, tek deneme)
```

Son satır özet (parse edilen sipariş sayısı + sayfa bilgisi).

`current_unit_price = null` durumunda:
```
Güncel birim fiyat: — (ürün artık listede değil)
```

### `--json` (stdout)

```json
[
  {
    "product_name": "Çelik İnşaat Demiri Ø12mm × 12m",
    "order_date": "2026-04-23",
    "purchase_unit_price": 142.50,
    "current_unit_price": 156.00,
    "currency": "TRY"
  },
  {
    "product_name": "Elektrikli Matkap Bosch GBM 13 RE",
    "order_date": "2026-03-15",
    "purchase_unit_price": 4250.00,
    "current_unit_price": null,
    "currency": "TRY",
    "notes": "ürün artık listede değil"
  }
]
```

**JSON kuralları:**
- Pretty-print (2-space indent) — okunaklı debug için
- Türkçe karakterler escape edilmez (`JSON.stringify(_, _, 2)` default davranışı, Node.js'te UTF-8)
- Sayılar `number` literal (string değil)
- Boş sipariş geçmişi: `[]` + stderr warning

### stderr (her durumda)

Verbose mode AÇIK ise her adım için bir satır:
```
[scrape] Browser launched (headless)
[scrape] Navigating to login page: https://b2b.enderyapi.com.tr/login
[scrape] Login form found, filling credentials
[scrape] Login submitted, waiting for navigation
[scrape] Logged in, navigating to orders page
[scrape] Orders list found, parsing rows
[scrape] Row 1: Çelik İnşaat Demiri Ø12mm × 12m — visiting product page for current price
[scrape] Row 1 complete
[scrape] Done, 2 valid order lines parsed
```

Default mode'da: hata mesajı dışında stderr boş.

### Hata mesajları (stderr)

[data-model.md → ScrapeError mode tablosu](../data-model.md#mode--mesaj-eşleme-tablosu-fr-012-fr-014-fr-015) bağlayıcı kontrat.

Örnekler:
```
Hata: Login başarısız: geçersiz kullanıcı adı veya şifre
Screenshot: scrape-debug/2026-05-16T20-30-45-login-failed.png
```

```
Hata: CAPTCHA tespit edildi (tip: Cloudflare)
Screenshot: scrape-debug/2026-05-16T20-31-12-captcha.png
Detay (--verbose ile görünür): URL'de "cdn-cgi/challenge-platform" tespit edildi
```

```
Hata: ENDERYAPI_USERNAME ve/veya ENDERYAPI_PASSWORD .env.local'da tanımlı değil
```

---

## Exit codes

| Code | Anlam |
|------|-------|
| 0 | Başarı (en az 1 sipariş parse edildi VEYA `empty-history` durumu) |
| 1 | Failure (her ScrapeError mode, `missing-credentials` hariç hepsi `1` ile çıkar) |
| 2 | Usage error (bilinmeyen flag veya `--help` aslında 0 ile çıkar) |

`empty-history` özel: success kabul (script çalıştı, site cevap verdi, sipariş yoktu — failure değil).

---

## Side effects (yan etkiler)

| Etki | Konum | Ne zaman |
|------|-------|----------|
| Screenshot dosyası | `scrape-debug/<ISO-timestamp>-<mode>.png` | Yalnız hata durumunda; başarılı koşmada üretilmez |
| `scrape-debug/` klasör oluşturma | Repo kökü | İlk hata anında auto-create |
| stdout yazma | Terminal | Her zaman (başarıda data, hatada hiçbir şey) |
| stderr yazma | Terminal | Hatada her zaman; `--verbose` ile başarıda da log |
| Network istekleri | b2b.enderyapi.com.tr | Çalışma boyunca |
| **YOK:** DB write, .env yazma, başka dosya | — | — |

**Garanti:** Script `.env.local`'a, Supabase'e, başka herhangi bir dosyaya yazmaz.

---

## Performance contract

| SLO | Hedef |
|-----|-------|
| Happy path medyan | < 45 sn |
| Happy path p95 | < 60 sn |
| `login-failed` exit | < 30 sn |
| `network` exit | < 30 sn |
| `captcha`/`2fa` detection exit | < 30 sn |
| Maksimum çalışma | 60 sn (otomatik timeout) |

Browser launch tek seferlik ~3-5 sn cost; geri kalan ağ + parse zamanı.

---

## Compatibility / determinism contract

- **Aynı koşullarda aynı çıktı:** Kimlik bilgileri aynı + site aynı → çıktı tutarlı (sipariş listesi değişmediyse). Sipariş listesi günlük değiştiği için günlük varyans normal.
- **Bağımsızlık:** Script başka hiçbir servise (Supabase, GitHub, vb.) bağlanmaz; tamamen offline-kabiliyetli (target site dışında).
- **Re-runnable:** İdempotent. Aynı dakikada 2 kez çalıştırılırsa aynı sonuç. (Rate limit tetiklemez tipik bir kullanıcı tempo'sunda — SC-008.)

---

## Security contract

[FR-002, FR-019] — Kontrat halinde:

- `ENDERYAPI_PASSWORD` **asla** stdout'a basılmaz
- `ENDERYAPI_PASSWORD` **asla** stderr'e basılmaz (verbose mode'da bile — verbose log'unda "filling credentials" der, değeri göstermez)
- `ENDERYAPI_USERNAME` **stderr verbose log'da görünmez** (defense — kullanıcı PR yapıp ekran görüntüsü yapıştırırsa email sızmasın)
- Screenshot dosya adında kimlik bilgisi yok
- Screenshot içeriğinde **şifre input'u maskeli** (`type="password"` field bullet gösterir) — Playwright doğal davranış
- Screenshot içeriğinde **email görünebilir** (input field'da yazılı) — bu kabul edilir bir tradeoff, screenshot debug için lazım; geliştirici screenshot'u paylaşmadan önce kendi sorumluluğu

---

## Help text (`--help` çıktısı)

```
Enderyapi Scraper PoC — b2b.enderyapi.com.tr sipariş geçmişi okuyucusu

Kullanım: npm run scrape:enderyapi [-- FLAGS]

Flag'ler:
  --json, -j        Çıktıyı JSON dizisi olarak yaz (default: düz metin)
  --headed          Browser penceresini görünür çalıştır (default: headless)
  --verbose, -v     Detaylı log (stderr'e)
  --help, -h        Bu yardımı göster

Env vars (.env.local'da tanımlanır):
  ENDERYAPI_USERNAME    Tedarikçi sitedeki kullanıcı adı/email
  ENDERYAPI_PASSWORD    Tedarikçi sitedeki şifre

Örnek:
  npm run scrape:enderyapi -- --json --verbose

Hata durumunda screenshot: scrape-debug/<timestamp>-<mode>.png
Exit code: 0 başarı, 1 hata, 2 kullanım hatası
```
