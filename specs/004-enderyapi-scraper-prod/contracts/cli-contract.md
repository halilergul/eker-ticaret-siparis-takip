# Contract — CLI `npm run scrape`

**Feature**: 004-enderyapi-scraper-prod | **Tarih**: 2026-05-16

## Komut imzası

```bash
npm run scrape -- --supplier <slug> [--headed] [--verbose] [--limit <n>] [--skip-catalog] [--help]
```

İç çağrı: `tsx scripts/scrape/run.ts <args>`.

## Argümanlar

| Flag | Tip | Default | Açıklama |
|------|-----|---------|----------|
| `--supplier <slug>` | required | — | Tedarikçi slug (örn. `enderyapi`). Bilinmeyen slug → exit 2. |
| `--headed` | boolean | false | Browser görünür (debug için). |
| `--verbose` | boolean | false | Her adımı log'lar; başarılı adımlarda screenshot da basılır. |
| `--limit <n>` | int | — | En yeni N siparişle sınırla (test/debug). |
| `--skip-catalog` | boolean | false | P2 atla (sadece sipariş yansıt; fiyat snapshot yazma). |
| `--help` | boolean | false | Kullanım metni basıp çık (exit 0). |

## Exit kodları

| Code | Anlam | scrape_runs.status |
|------|-------|---------------------|
| 0 | Başarı (errors=[]) veya partial başarı (>%50 sipariş işlendi) | `success` veya `partial` |
| 1 | Genel hata (DB connection, beklenmedik exception) | `failed` |
| 2 | Argv hatası (unknown supplier, malformed flags) | (kayıt yok) |
| 3 | Login fail (kimlik geçersiz, 2FA, captcha) | `failed` |
| 4 | Global 5dk timeout | `aborted` |

## Stdout / stderr

### Başarılı koşum (verbose=false)

```
[scrape] Tedarikçi: Enderyapi B2B
[scrape] Sipariş listesi okunuyor...
[scrape] 20 sipariş bulundu
[scrape] Sipariş detayları işleniyor: 20/20 ✓
[scrape] Katalog güncel fiyatlar: 30/30 (28 başarılı, 2 NULL)
[scrape] Özet:
  - Yeni sipariş: 2
  - Mevcut sipariş atlandı: 18
  - Yeni satır: 5
  - Fiyat snapshot eklendi: 3
[scrape] ✅ Başarılı (1m 42s)
```

### Hata (login fail)

```
[scrape] Tedarikçi: Enderyapi B2B
[scrape] Login deneniyor...
[scrape] ❌ HATA: login-failed — Kullanıcı adı veya şifre yanlış.
[scrape] Debug screenshot: scrape-debug/<runId>/login-failed.png
```

stderr'a ScrapeError JSON formatı (PoC pattern), exit 3.

### Help (--help)

```
Kullanım: npm run scrape -- --supplier <slug> [--headed] [--verbose] [--limit N] [--skip-catalog]

Bir B2B tedarikçi sitesinden siparişleri ve güncel fiyatları çeker; veritabanına yazar.

Argümanlar:
  --supplier <slug>     Tedarikçi slug (zorunlu). Örn: enderyapi
  --headed              Browser görünür açılır (debug)
  --verbose             Her adımı log'lar
  --limit <n>           En yeni N sipariş ile sınırla
  --skip-catalog        Katalog enrichment'i atla (sadece sipariş yansıt)
  --help                Bu mesajı göster

Kayıtlı tedarikçiler:
  - enderyapi (Enderyapi B2B)

Örnekler:
  npm run scrape -- --supplier enderyapi
  npm run scrape -- --supplier enderyapi --verbose --limit 5
  npm run scrape -- --supplier enderyapi --skip-catalog
```

## Güvenlik

- Kimlik bilgileri **hiçbir** stdout/stderr satırında, **hiçbir** screenshot dosya adında, **hiçbir** `scrape_runs.summary.errors[].detail` metnindeki görünmez (FR-008, SC-006).
- `SUPABASE_SERVICE_ROLE_KEY` env değişkeni `process.env` üzerinden okunur; CLI parametresi olarak kabul edilmez.

## Side effects

| Side effect | Koşulu |
|-------------|--------|
| `scrape_runs` INSERT (status=running) | Komut başlangıcı |
| `scrape_runs` UPDATE (status=terminal) | Komut sonu (success/partial/failed/aborted) |
| `supplier_orders` INSERT (ON CONFLICT DO NOTHING) | Her sipariş için |
| `order_items` INSERT (ON CONFLICT DO NOTHING) | Her satır için |
| `products` INSERT/UPDATE (RPC içinden) | Her ürün için (katalog ziyareti) |
| `price_snapshots` INSERT (RPC içinden) | Fiyat değişen ürün için |
| `scrape-debug/<runId>/*.png` | Hata + verbose adımlarda |

## Bağımsız test senaryosu

1. `.env.local` doğru (`ENDERYAPI_USERNAME/PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY`).
2. `npm run scrape -- --supplier enderyapi --verbose --limit 3` çalıştır.
3. Beklenen: 3 sipariş + N ürün satırı + 1 `scrape_runs` kaydı (`status='success'` veya `'partial'`).
4. Aynı komutu tekrar çalıştır. Beklenen: aynı satır sayıları; `scrape_runs` 2. kayıt; `summary.orders_inserted=0`.
