# Implementation Plan: Yedekler İnşaat tedarikçi eklemesi (010)

**Branch**: `010-yedekler-supplier` | **Date**: 2026-06-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-yedekler-supplier/spec.md`

## Summary

Yedekler İnşaat (4. B2B tedarikçi) için sipariş + catalog scrape eklenir. 008/009 ile kurulan adapter pattern'i tekrar uygulanır; tek yapısal yenilik 3-alanlı login (müşteri kodu + kullanıcı kodu + parola) — mevcut `loadCredentials()` helper'ı bunu desteklemiyor, supplier-bazlı `loadYedeklerCredentials()` özel varyantı eklenir. UI değişikliği yok: settings, /dashboard ve /dashboard/zamlanan-urunler `suppliers` tablosundan dinamik render olduğu için yeni satır seed'lendiğinde otomatik 4. tedarikçi görünür. Cron + workflow_dispatch için scrape.yml choice listesine `yedekler` ve env blok eklenir. Yaklaşım: DOM keşif → adapter implementation → DB seed → workflow + secrets → lokal yeşil → production smoke.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), Node.js 22 (GH Actions runner ile uyumlu)

**Primary Dependencies**: Next.js 15 App Router + React 19, Supabase JS + @supabase/ssr, Playwright (Chromium), Tailwind 4, react-hook-form + zod, dotenv

**Storage**: Supabase Postgres — mevcut tablolar (`suppliers`, `scrape_runs`, `orders`, `order_items`, `products`, `product_price_snapshots`, `scrape_schedule`). Yeni tablo/kolon YOK.

**Testing**: Manuel quickstart (lokal `.env.local` + `npm run scrape:all -- --supplier yedekler`). DB query'lerle doğrulama. Mevcut tedarikçilerde regresyon olmadığını doğrulayan smoke. Unit/integration test eklenmez (mevcut pattern test'siz; sıfır-maliyet hedefi + tek kullanıcı).

**Target Platform**: 
- Frontend: Vercel (Next.js production deploy)
- Scrape job: GitHub Actions Ubuntu 24.04 runner (free tier 2000 dk/ay kotası)

**Project Type**: Web application (full-stack monorepo — `app/`, `lib/`, `scripts/`, `supabase/`)

**Performance Goals**: 
- Tek Yedekler scrape koşumu: <5dk (orchestrator 5dk timeout; workflow override 8dk = 480000ms)
- Settings sayfası TriggerCard renderden 2sn içinde görünür (SC-006)
- Trigger butonu tıklamasından 5sn içinde "Çalışıyor" durumuna geçiş (SC-006)

**Constraints**:
- Sıfır maliyet (free tier sınırları)
- GitHub Actions per-workflow timeout: 15dk (workflow file)
- DOM scrape kırılganlığı (site sahibi HTML değiştirebilir)
- Yedekler HTTP/HTTPS bilinmiyor — keşif sonucu netleşir; HTTP ise 008'deki İkizler gibi açık kabul edilebilir (Constitution 2026-05-17 kararı pattern'i)
- Tek-tek tedarikçi credentials: yedekler için 3 ayrı env değişkeni gerekli (CUSTOMER_CODE + USER_CODE + PASSWORD)

**Scale/Scope**:
- 1 yeni adapter dosyası (~400-600 LOC + constants dosyası ~80-150 LOC, 008/009 baseline'ından)
- 4 tedarikçili sisteme genişler (önceki 3 + Yedekler)
- Beklenen Yedekler catalog hacmi: 50-500 ürün
- Beklenen Yedekler sipariş hacmi: aylık ~10-50 sipariş

## Constitution Check

*GATE: Phase 0 öncesi geçmeli; Phase 1 sonrası tekrar kontrol edilmeli.*

| Constitution Maddesi | Plan Uyumu | Not |
|---|---|---|
| TypeScript, Tailwind, Supabase + RLS, Vercel + GH Actions stack | ✅ Uyumlu | Yeni stack tanıtımı yok; mevcut omurga kullanılır |
| Adapter mimarisi (her tedarikçi ayrı modül, UI değişmez) | ✅ Uyumlu | Yedekler için tek adapter dosyası + constants dosyası |
| B2B credentials GitHub Secrets'ta | ✅ Uyumlu | 3 yeni secret eklenecek: `YEDEKLER_CUSTOMER_CODE`, `YEDEKLER_USER_CODE`, `YEDEKLER_PASSWORD` |
| Şifreler asla log'a/repo'ya yazılmaz | ✅ Uyumlu | `loadYedeklerCredentials()` mevcut pattern'i takip eder; log'larda yalnız failure mode etiketi |
| GH Actions üzerinde scheduled scrape (Vercel Cron değil) | ✅ Uyumlu | Mevcut `scrape.yml` ve `scrape_schedule` tablosu kullanılır |
| Türkçe karakter desteği (ı, İ, ş, Ş, ç, vb.) | ⚠️ Dikkat | "Yedekler İnşaat" tedarikçi adı içeriyor; supplier seed migration'da UTF-8 encoding doğru olmalı (003/008 pattern'i zaten çözmüş) |
| Site DOM kırılma noktasına karşı failure mode etiketleri | ✅ Uyumlu | `ScrapeError({ mode, step, details })` mevcut pattern'i kullanılır |
| Sıfır maliyet (free tier) | ✅ Uyumlu | 4. tedarikçi 2000 dk/ay GH Actions kotasını anlamlı şekilde zorlamaz (~10-15dk/gün artış kabul edilebilir) |
| RLS policy zorunlu (her tablo) | ✅ Uyumlu | Yeni tablo yok; mevcut RLS aynen geçerli |
| HTTP plaintext credential kabul edilebilir (İkizler precedent) | ⏳ Belirsiz | Yedekler HTTP/HTTPS bilinmiyor; HTTPS varsayılır; HTTP ise kullanıcı onayı alınır + Constitution'a not düşülür |
| Anti-goal'ler (stok takibi, alternatif öneri, cross-supplier eşleştirme — YOK) | ✅ Uyumlu | Spec'te explicit anti-goal'ler dokümante edildi |
| `.env.local` artık yalnız dev için (G15) | ✅ Uyumlu | Production'da credentials GH Secrets + Vercel env'de |

**Sonuç**: Geçici "⚠️"ler (Türkçe karakter, HTTP) implementation aşamasında çözülecek bilinen riskler — gate engellemiyor.

## Project Structure

### Documentation (this feature)

```text
specs/010-yedekler-supplier/
├── plan.md              # Bu dosya
├── spec.md              # /speckit-specify çıktısı (yazıldı)
├── research.md          # Phase 0 — DOM keşif planı, credentials extension, KDV davranışı
├── data-model.md        # Phase 1 — mevcut entity'ler + Yedekler supplier seed
├── quickstart.md        # Phase 1 — lokal + production smoke akışları
├── contracts/
│   └── adapter-interface.md   # Phase 1 — Adapter contract Yedekler uyumu
├── checklists/
│   └── requirements.md  # Spec quality (yazıldı, geçti)
└── tasks.md             # /speckit-tasks çıktısı (NOT created here)
```

### Source Code (eklenen/değişen dosyalar)

```text
lib/scraper/
├── adapter-registry.ts          # MODIFY: yedeklerAdapter import + registry'e ekle
├── adapters/
│   ├── yedekler.ts              # NEW: Yedekler adapter (Adapter interface implementation)
│   └── yedekler.constants.ts    # NEW: selectors, URLs, parsing kuralları
├── types.ts                     # NO CHANGE — Adapter interface zaten generic
├── run-logger.ts                # NO CHANGE
├── supabase-writer.ts           # NO CHANGE
└── errors.ts                    # NO CHANGE

scripts/scrape/
├── credentials.ts               # MODIFY: loadYedeklerCredentials() ekle (3-alanlı)
├── all.ts                       # NO CHANGE (orchestrator zaten supplier-agnostic)
├── catalog.ts                   # NO CHANGE
├── run.ts                       # NO CHANGE (sipariş entry, supplier-agnostic)
└── check-schedule.ts            # NO CHANGE

scripts/scrape-tools/             # NEW (opsiyonel — DOM keşif diag script'leri)
└── yedekler-diag.ts             # Tek seferlik keşif aracı (login + DOM dump)

supabase/migrations/
└── 20260605000000_seed_yedekler.sql   # NEW: suppliers + scrape_schedule satırları

.github/workflows/
└── scrape.yml                   # MODIFY: choice'a yedekler ekle, env bloklarına 3 secret

components/                      # NO CHANGE — UI dinamik
app/                             # NO CHANGE
next.config.ts                   # POSSIBLY MODIFY: ürün görseli scrape edilirse domain whitelist
```

**Yapı kararı**: Mevcut "single project" layout korunur (Next.js full-stack monorepo); ayrı paket/workspace açılmaz.

## Phase 0: Research (Outline & Research)

### Bilinmeyen #1: Yedekler login formu HTML/DOM yapısı

**Soru**: 3 alanlı form (müşteri kodu + kullanıcı kodu + parola) hangi selector'larla bulunur? Tek POST mu yoksa multi-step wizard mı? CSRF token var mı? Captcha var mı?

**Araştırma yöntemi**: 
- `scripts/scrape-tools/yedekler-diag.ts` yazılır (iteratif diag)
- Playwright ile login sayfası açılır, HTML dump alınır, network trace incelenir
- Sonuç `research.md`'de selector listesi olarak dokümante edilir

**Çıktı**: Login flow için `LOGIN_URL`, 3 input selector'ı, submit button selector'ı, başarı tespiti (URL veya DOM marker)

### Bilinmeyen #2: Site platform tipi

**Soru**: PHP/ASP.NET/Custom/E-ticaret SaaS? Aşağıdaki ipuçlarına bakılır:
- HTML response header'ları (`X-Powered-By`, `Server`)
- URL pattern'ları (`.aspx`, `.php`, `/`, query string yapısı)
- Form gönderim mekaniği (multipart, AJAX)
- Markup pattern'ları

**Neden önemli**: Platform tipi sayfa pagination, AJAX kullanımı, session yönetimi davranışını tahmin ettirir; debug süresini kısaltır.

**Çıktı**: `research.md`'de platform tipi + tipik gotcha'lar (örn. ASP.NET ise ViewState handling)

### Bilinmeyen #3: Sipariş listesi sayfası DOM

**Soru**: Siparişler nerede listelenir? Tablo mu, kart mı? Pagination var mı? Sipariş no, tarih, durum, toplam tutar hangi selector'larda?

**Araştırma yöntemi**: Login sonrası "Siparişler" / "Sipariş Geçmişi" / "Belgeler" menüsüne navigate; HTML dump; selectors işaretle.

**Çıktı**: `LIST_URL`, sipariş satırı selector, alan selector'ları (`orderNo`, `orderedAt`, `status`, `totalAmount`)

### Bilinmeyen #4: Sipariş detayı sayfası DOM

**Soru**: Sipariş kalemleri (ürün kodu, ad, qty, birim fiyat KDV hariç) nasıl gösterilir? Detay sayfa mı, modal mı, AJAX mı?

**Araştırma yöntemi**: Bir siparişi tıkla, ürün satırlarının selector'larını belirle.

**Çıktı**: Detay URL pattern (veya modal trigger), item row selector, alan selector'ları, KDV hariç fiyat parse kuralı

### Bilinmeyen #5: Catalog sayfası DOM

**Soru**: Ürün catalog'u nerede? URL nedir? Ürün kodu + ad + KDV hariç net özel fiyat (Liste × iskonto) hangi selectors? KDV oranı yazıyor mu?

**Araştırma yöntemi**: Catalog menüsüne (varsa) navigate; pagination var mı bak; bir ürünün fiyat alanlarını incele.

**Çıktı**: `CATALOG_URL`, ürün satırı selector, fiyat parse mantığı, varsa KDV oranı selector

### Bilinmeyen #6: Ürün görseli scrape edilebilir mi?

**Soru**: Catalog liste sayfasında `<img src="...">` var mı? Modal-tabanlı ise atlanır (İkizler pattern'i 010 kapsamı dışı).

**Çıktı**: Karar — eklensin/atlansın + `next.config.ts` whitelist gerekirse

### Bilinmeyen #7: 3-alanlı credentials helper

**Soru**: `loadCredentials()` 2-alanlı; nasıl genişletilir?

**Karar**:
- Mevcut helper aynen kalır (geri uyumluluk)
- `loadYedeklerCredentials(): { customerCode: string; userCode: string; password: string }` ayrı export
- Yedekler adapter'ı bunu çağırır
- Generic'leştirme YAPILMAZ (over-engineering — sadece 1 tedarikçi 3-alanlı)

### Bilinmeyen #8: Sayfa hacmi & pagination

**Soru**: Catalog 1000+ ürün içeriyorsa tek seferde tarama uzar mı?

**Yaklaşım**: 
- İlk koşumda gözlemlenir
- 500+ ürün varsa pagination/batching tasarlanır (008'de İkizler için yapıldığı gibi)
- 50-500 aralığında olduğu varsayılır (Assumption)

**Çıktı**: research.md'de "ölçülecek, gerekirse pagination eklenir" notu

### Phase 0 Çıktısı

`research.md` aşağıdaki bölümlerle:
1. Diag script çalıştırma sırası (login → orders → catalog → image scrape kontrolü)
2. Her bilinmeyen için karar + alternatives considered
3. Risk tablosu (captcha, multi-step wizard, AJAX-yoğun DOM)

## Phase 1: Design & Contracts

### 1. Data Model

`data-model.md` üretilir. Özet:
- **Yeni tablo**: YOK
- **Yeni kolon**: YOK
- **Yeni satır (seed)**:
  - `suppliers` tablosuna 1 satır (slug=yedekler, name=Yedekler İnşaat, base_url=...)
  - `scrape_schedule` tablosuna 1 satır (supplier_id, enabled=true, daily_hour_utc=03 veya 06)
- Mevcut entity'ler (Order, OrderItem, Product, ProductPriceSnapshot) supplier_id ayrımıyla Yedekler kayıtlarını taşıyacak

### 2. Contracts

`contracts/adapter-interface.md` üretilir. Özet:
- **Mevcut Adapter interface** (lib/scraper/types.ts) Yedekler için aşağıdaki gereksinimleri taşır:
  - `slug: "yedekler"`, `displayName: "Yedekler İnşaat"`
  - `login(ctx)` — 3-alanlı credentials helper'ı kullanır
  - `listOrders(ctx, limit?)` → `RawOrderSummary[]`
  - `getOrderDetail(ctx, order)` → `RawOrderDetail`
  - `getProductPrice(ctx, code)` → `number | null` (orders fiyat doğrulama için — opsiyonel kullanım)
  - `scrapeCatalog?(ctx, targets)` → `CatalogScrapeResult[]` (catalog faz için, P2'de implement edilir)
- **Credentials contract** (yeni helper):
  ```typescript
  type YedeklerCredentials = {
    customerCode: string;
    userCode: string;
    password: string;
  };
  loadYedeklerCredentials(): YedeklerCredentials;
  ```

### 3. Quickstart

`quickstart.md` üretilir. İçerik:
1. **Lokal P1 (sipariş scrape) test**:
   - `.env.local` 3 secret ile doldurulduğunu doğrula
   - `npm run scrape:all -- --supplier yedekler --skip-catalog`
   - DB query: en az 1 order satırı + items
   - 2. koşum idempotent
2. **Lokal P2 (catalog scrape) test**:
   - `npm run scrape:all -- --supplier yedekler` (catalog phase aktif)
   - DB query: product_price_snapshots'a 10+ satır
   - 2. koşum idempotent
3. **Production smoke (P3) test**:
   - GitHub Secrets'a 3 secret ekle (`YEDEKLER_CUSTOMER_CODE`, `YEDEKLER_USER_CODE`, `YEDEKLER_PASSWORD`)
   - Vercel env'e 3 secret ekle (workflow_dispatch için)
   - `git push` → Vercel deploy bekle
   - Settings → "Şimdi tetikle" basıldığında kart "Çalışıyor"a geçiş
   - GH Actions Run completed olduğunda kart "Başarılı"
   - /dashboard'da Yedekler siparişi
   - /dashboard/zamlanan-urunler'da Yedekler ürünü (veri varsa)

### 4. Agent Context Update

`CLAUDE.md`'de `<!-- SPECKIT START -->...<!-- SPECKIT END -->` markerları arası güncellenir:
- "Aktif feature: 010-yedekler-supplier" reference'ı
- Plan dosya path

### Phase 1 Çıktısı

- `data-model.md`
- `contracts/adapter-interface.md`
- `quickstart.md`
- `CLAUDE.md` güncel

### Constitution Re-Check (post-Phase 1)

Phase 1 design'ı Constitution prensiplerine uyumlu mu? — Phase 0/1 outputları yazıldıktan sonra tabloya tekrar bakılır. Beklenen sonuç: hiçbir gate'i ihlal etmiyor (mevcut omurgaya additive).

## Notes

- **HTTP precedent**: Eğer Yedekler HTTPS değil HTTP servis ediyorsa, İkizler 008 kararı (`Constitution 2026-05-17`) pattern'i takip edilir: kullanıcı onayı alınır, Constitution'a karar satırı eklenir, plaintext kredensiyel transmission kabul edilir.
- **Görsel scrape opsiyonel**: P1+P2'nin başarısı görsel scrape'e bağımlı değil. Faz B (görsel) keşif sonrası kararlaştırılır; modal-tabanlı ise 011'e ertelenir (İkizler pattern'i).
- **DOM keşif iteratif**: research.md'deki diag script'lerin çıktısı plan'ı revize edebilir. tasks.md aşamasında detaylı task listesi çıkacak; plan high-level yön gösteriyor.
- **Production smoke ertelenebilir**: P3 task'leri lokal P1+P2 yeşil olmadan başlatılmaz (riske karşı kapı).
