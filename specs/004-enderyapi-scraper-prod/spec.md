# Feature Specification: Enderyapi Gerçek Scraper — Adapter Pattern + Schema Yazma + Fiyat Snapshot

**Feature Branch**: `004-enderyapi-scraper-prod`

**Created**: 2026-05-16

**Status**: Draft

**Input**: User description: "PoC (002) feasibility'i kanıtladı, schema (003) hazır. Şimdi gerçek scraper: çoklu tedarikçi sitelere genişleyebilir adapter mimarisi, ilk adapter olarak Enderyapi. Sipariş başlık + ürün satırlarını schema'ya idempotent yazar; ürün katalog sayfasından güncel fiyatı okuyup `record_price_observation` RPC'sini çağırır. Hata yönetimi + her run'ın izlenebilmesi için scrape_runs tablosu."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Sipariş geçmişini veritabanına yansıt (Priority: P1) 🎯 MVP

Kullanıcı (Halil) tek bir komutla (örn. `npm run scrape -- --supplier enderyapi`) Enderyapi'deki tüm geçmiş siparişleri ve içindeki ürün satırlarını veritabanına aktarabilmeli. İkinci kez çalıştırıldığında veri çoğalmamalı (idempotent); yeni siparişler varsa eklenmeli.

**Why this priority**: Bu projenin temel value proposition'u — geçmiş alış fiyatlarını bilmeden hiçbir fiyat farkı analizi yapılamaz. P1 olmadan sistem hiçbir kullanım değeri sunmaz. Aynı zamanda en zorlu teknik kısım (login + iki seviyeli scrape + idempotent upsert + hata yönetimi).

**Independent Test**: Boş bir veritabanı (sadece supplier seed) ile komut çalıştırılır → sipariş listesi okunur, her sipariş için detay sayfası ziyaret edilir, ürün satırları okunur, schema'ya yazılır. İkinci kez aynı komut çalıştırılır → satır sayıları aynı kalır. Üçüncüsünde tedarikçi yeni bir sipariş eklerse (sentetik simülasyon yeterli) → yalnızca o sipariş eklenir.

**Acceptance Scenarios**:

1. **Given** boş veritabanı (1 supplier kaydı: enderyapi), **When** komut `--supplier enderyapi` ile çalıştırılır, **Then** N adet sipariş `supplier_orders`'a + her birinin M ürün satırı `order_items`'a + her ürün kodu `products` katalog tablosuna idempotent şekilde insert edilir. Komut çıkış kodu 0, stdout'a özet basılır (toplam siparişler, satırlar, yeni eklenenler, atlananlar).
2. **Given** önceki senaryonun sonucu, **When** komut tekrar çalıştırılır, **Then** hiçbir tabloda yeni satır oluşmaz; özet "0 new orders, 0 new items" gibi raporlar.
3. **Given** komut çalışırken bir sipariş detayı sayfası açılamaz (timeout veya 5xx), **When** scraper bu siparişi atlar ve devam eder, **Then** diğer siparişler yine işlenir; atlanan sipariş `scrape_runs` log'una hata detayıyla yazılır; komut exit code 0 (kısmi başarı), eğer hata oranı > %50 ise exit code != 0.

---

### User Story 2 — Ürün katalog sayfasından güncel fiyat çek (Priority: P2)

Sipariş satırlarındaki her ürün kodu için Enderyapi katalog sayfası (henüz 002 PoC'da keşfedilmemiş 3. seviye) ziyaret edilir; güncel birim fiyat okunur; `record_price_observation` RPC çağrılır. Fiyat değiştiyse `price_snapshots` satırı eklenir.

**Why this priority**: Sistem değeri = (geçmiş alış fiyatı) − (güncel fiyat). P1 olmadan P2 anlamsız ama P2 olmadan da P1 tek başına "geçmiş sipariş tablosu" — temel value proposition (fiyat farkı) hayata geçmez. P2 priority'sini düşüren tek şey: katalog DOM yapısı henüz görülmedi, %30 belirsizlik var; en kötü ihtimalde feature 005'e ertelenir.

**Independent Test**: 5 ürün kodu için (önceki sipariş satırlarından) katalog ziyareti yapılır; her birinde güncel fiyat parse edilir; `record_price_observation` 5 kez çağrılır; `price_snapshots`'a fiyat değişen kadar satır eklenir; `products.current_unit_price` ve `last_seen_at` güncellenir. İkinci kez çalıştırıldığında aynı fiyatlar gelirse `price_snapshots` artmaz.

**Acceptance Scenarios**:

1. **Given** `products` tablosunda 10 ürün, hiçbirinde `current_unit_price` yok, **When** katalog enrichment çalışır, **Then** her ürün için katalog sayfası ziyaret edilir; fiyat parse edilenler için RPC çağrılır; başarılı çağrı sayısı stdout'a basılır.
2. **Given** önceki senaryo, fiyatlar değişmedi, **When** komut tekrar çalıştırılır, **Then** `price_snapshots` satır sayısı aynı kalır; `products.last_seen_at` güncellenir ama `current_unit_price` değişmez.
3. **Given** katalog sayfasında bir ürün için fiyat parse edilemiyor (boş, "stokta yok", parse hatası), **When** scraper bu ürünü `current_unit_price=NULL` ile geçer, **Then** `price_snapshots`'a satır yazılmaz; `scrape_runs` log'una "price parse failed for code=X" düşülür; diğer ürünler etkilenmez.

---

### User Story 3 — Her scrape koşumunun izlenebilirliği (Priority: P3)

Kullanıcı CLI çıkışı dışında geçmiş scrape koşumlarını sorgulayabilmeli: ne zaman çalıştı, ne kadar sürdü, kaç sipariş/ürün işlendi, varsa hata mesajları. Bu veri sonraki feature'larda (UI dashboard) "son güncelleme: X dakika önce" göstermek için gerekli.

**Why this priority**: V1 için zorunlu değil — manuel CLI çıkışı izlemek yeterli. Ama scrape_runs olmadan otomatik GitHub Actions (005) sonuçlarını kaydetmek + dashboard'da göstermek (006+) zor. Foundation olarak yerleştirmek mantıklı; P3 çünkü P1+P2 olmadan kullanışsız.

**Independent Test**: Scraper koşar → `scrape_runs` tablosuna 1 satır eklenir (`started_at`, `finished_at`, `status`, `summary` JSON). Failure senaryosu (örn. login başarısız) → satır yine eklenir, `status='failed'`, `error_message` doldurulur. Manuel SQL ile son 5 koşum sorgulanabilir.

**Acceptance Scenarios**:

1. **Given** scraper başarıyla tamamlandı, **When** `SELECT * FROM scrape_runs ORDER BY started_at DESC LIMIT 1`, **Then** `status='success'`, `summary` JSON'unda `{ orders_inserted, orders_updated, items_inserted, products_observed, snapshots_added }` doldurulur.
2. **Given** scraper login adımında başarısız oldu, **When** sorgu aynı, **Then** `status='failed'`, `error_message` "login failed: ..." içerir, `finished_at` set edilmiş; tablo veri yazılmamış.

---

### Edge Cases

- **Login çökerse**: scraper exit code != 0, `scrape_runs.status='failed'`, kullanıcı CLI'da hata mesajı görür; veritabanı dokunulmaz. Yeniden deneme (retry) bu feature'da YOK; kullanıcı manuel tekrar çalıştırır.
- **Yarıda kesinti** (Ctrl+C, OOM): `scrape_runs` satırı `status='aborted'` olarak kalır; o ana kadar yazılan veri silinmez (her sipariş kendi transaction'ı). Tutarsızlık yok çünkü tüm yazımlar idempotent.
- **Yeni sipariş + eski sipariş bir arada**: scraper her zaman tüm sipariş listesini okur (filter yok); eski siparişlerin satırları ON CONFLICT DO NOTHING ile atlanır.
- **Katalog ürünü silinmiş**: Tedarikçi katalogdan ürünü kaldırırsa 404 alınır; o ürün için `last_seen_at` güncellenmez; `current_unit_price` mevcut değerinde kalır; `scrape_runs` log'una "product not found in catalog: code=X".
- **2 farklı katalog ürünü aynı koda sahipse** (Enderyapi tarafında inconsistency): unique constraint zaten engelleyemez (PK tek code, supplier başına unique). Schema doğru kabul ediyor; scraper ilk eşleşeni alır.
- **Network kesintisi** (mid-scrape): Playwright timeout default ayarları kullanılır; hata catch edilir; o sipariş atlanır, scraper devam eder.
- **Çoklu paralel koşum** (kullanıcı yanlışlıkla iki kere başlattı): İdempotent insert nedeniyle veri bozulmaz; ama `scrape_runs` 2 ayrı row olur; iki Chromium instance aynı anda çalışır (büyük site sorun, küçük site OK). V1'de paralel koruma yok.
- **Şifre yanlış / hesap kilitli**: Login adımında belirgin error mesajı; `scrape_runs.status='failed'`, message="invalid credentials".

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistem `npm run scrape -- --supplier <slug>` formatında CLI komutuyla tek bir tedarikçi için tam bir scrape koşumu yapabilmeli. Bilinmeyen slug → exit code != 0 + anlaşılır hata.
- **FR-002**: Sistem çoklu tedarikçi sitelerini destekleyecek adapter mimarisi sunmalı — yeni site eklemek, mevcut UI/CLI/DB kodunu değiştirmeden yeni adapter modülü yazmaktan ibaret olmalı.
- **FR-003**: Sistem Enderyapi adapter'ı için: (a) login yapar, (b) sipariş listesini okur, (c) her sipariş detayını ziyaret eder + ürün satırlarını çıkarır, (d) ürün katalog sayfasını ziyaret eder + güncel fiyatı çıkarır.
- **FR-004**: Sistem sipariş başlıklarını `supplier_orders` tablosuna idempotent yazmalı — aynı `(supplier_id, order_no)` ikinci kez insert edilirse satır eklenmez ve mevcut satır değiştirilmez (status değişimi UPDATE ile saklanabilir, ama V1'de UPDATE YOK — sadece INSERT ON CONFLICT DO NOTHING).
- **FR-005**: Sistem sipariş satırlarını `order_items` tablosuna idempotent yazmalı — aynı `(order_id, product_code)` ikinci kez insert edilirse atlanır.
- **FR-006**: Sistem ürün katalog gözlemini `record_price_observation` RPC'si üzerinden işlemeli — uygulama-side ürün tablosunu doğrudan yazmamalı (idempotency + race condition garantisi için).
- **FR-007**: Sistem her scrape koşumunu `scrape_runs` tablosuna kaydetmeli — `started_at`, `finished_at`, `supplier_id`, `status` (`success`/`partial`/`failed`/`aborted`), `summary` (JSON), `error_message` (NULL veya string).
- **FR-008**: Sistem login + B2B kimlik bilgilerini hiçbir log/stdout/dosyaya yazmamalı (002 ile aynı standart; 003'te eklenen tablo kayıtlarına yazılmamalı).
- **FR-009**: Sistem hata durumunda (login fail, sayfa açılamadı, vb.) erken çıkış yapmalı veya kısmi başarıyla devam etmeli — fail-fast vs continue-on-error davranışı her hata tipine göre. Login fail → hard stop; tek sipariş detay fail → atla + devam.
- **FR-010**: Sistem CLI'da `--verbose` flag'i ile her adımı log'lamalı; default modda sadece özet basmalı.
- **FR-011**: Sistem CLI'da `--limit <n>` flag'i ile en yeni N sipariş ile sınırlandırabilmeli (geliştirme/test için).
- **FR-012**: Sistem CLI'da `--skip-catalog` flag'i ile katalog enrichment'i atlayabilmeli (sadece P1 senaryosu, P2 yok).
- **FR-013**: Sistem global 5 dakikalık timeout taşımalı — scraper hangi sebeple olursa olsun 5 dakikadan uzun çalışırsa abort edilir ve `scrape_runs.status='aborted'` yazılır.
- **FR-014**: Sistem `service_role` Supabase istemcisi kullanmalı (RLS bypass) — `SUPABASE_SERVICE_ROLE_KEY` env var'dan okur.
- **FR-015**: Sistem her sipariş için **ayrı bir transaction** kullanmalı (header + items atomic; sipariş hatası diğerlerini etkilemez).
- **FR-016**: Sistem PoC'deki `scrape-debug/` screenshot mekanizmasını korumalı — hata durumlarında ekran görüntüsü `scrape-debug/<run-id>/<step>.png` olarak yazılmalı (Constitution: gitignored, secret yok).
- **FR-017**: Sistem CLI'dan `--help` ile kullanım dökümanı basabilmeli.

### Key Entities

- **ScrapeRun**: Bir scrape koşumunun denetim kaydı. Alanlar: `id` (UUID), `supplier_id` (FK → suppliers), `started_at`, `finished_at` (nullable), `status` ('running'/'success'/'partial'/'failed'/'aborted'), `summary` (JSONB — `{orders_total, orders_inserted, items_inserted, products_observed, snapshots_added, errors: []}`), `error_message` (text, nullable), `created_at`. Append-only. İlişki: N-1 → Supplier.
- **Adapter (kavramsal)**: Bir B2B site için login, listOrders, getOrderDetail, getProductPrice fonksiyonlarını sunan modül. Adapter interface'i 003'teki schema'ya bağımlı (supplier_id'sini bilir, ama Supabase client'ı dışarıdan alır — dependency injection).
- **ScrapeSummary**: ScrapeRun.summary alanının şekli (JSON şema). UI'da gösterileceği için stabil olmalı.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Boş veritabanından (sadece supplier seed) tek komutla, kullanıcının Enderyapi'deki tüm sipariş geçmişi (PoC'daki 20 sipariş gibi) DB'ye yazılır; ikinci koşumda satır sayıları sabit kalır. 30 dakikada doğrulanabilir.
- **SC-002**: Aynı komut tedarikçinin yeni sipariş eklediği durumda **sadece yeni satırlar** ekler; eski siparişler dokunulmaz (toplam satır = eski + yeni). 1 sentetik test ile doğrulanır.
- **SC-003**: Katalog enrichment, 10 ürün kodu için ortalama 5 saniyeden kısa süre alır (Playwright SPA waitForLoadState dahil) — toplam koşum 5 dakika sınırı altında kalır.
- **SC-004**: Fiyat değişen ürün için `price_snapshots` satırı görünür; aynı koşum tekrarlanırsa snapshot eklenmez. Manual SQL ile doğrulanır.
- **SC-005**: `scrape_runs` her koşumda 1 satır içerir; başarı + başarısızlık durumları arasında ayırt edilebilir; `summary` JSON'u UI'nin lookup yapacağı kadar zengin.
- **SC-006**: Login kimlik bilgileri hiçbir tablo, log, stdout veya screenshot dosyasında görünmez — manuel grep ile doğrulanır.
- **SC-007**: Yeni bir tedarikçi adapter'ı eklemek (sentetik test): 2 saatten kısa sürede, mevcut Enderyapi adapter'ını şablon kullanarak, herhangi bir orchestration kodunu değiştirmeden yapılabilir.
- **SC-008**: Komut help çıktısı (`--help`), insanın okuyup kullanmak için yeterli olduğunu kanıtlamalı (kullanım örnekleri, flag'ler, çıkış kodları).

## Assumptions

- **Katalog 3. seviye DOM henüz görülmedi**: Enderyapi'nin ürün detay/katalog sayfası 002 PoC'da ziyaret edilmedi. Bu feature'da en az 1 ürün için manuel keşif yapılır; selector'lar PoC pattern'ına benzer (aday array + verbose log) ile bulunur. %30 belirsizlik var; en kötü senaryoda katalog enrichment 005'e ertelenir, sadece P1 ile MVP closure.
- **Sadece Enderyapi adapter'ı yazılır**: Multi-site interface kurulur ama ikinci adapter eklenmez. Yeni site eklemek 005+ feature'da yapılır.
- **Scrape sıklığı manuel**: GitHub Actions cron 005'te eklenir. V1 feature 004'te kullanıcı kendi makinesinde `npm run scrape` çalıştırır.
- **B2B kimlik bilgileri**: PoC ile aynı — `.env.local` üzerinden `ENDERYAPI_USERNAME` + `ENDERYAPI_PASSWORD`. GitHub Secrets'a taşıma 005'te.
- **Retry stratejisi yok**: V1'de scraper başarısız olursa kullanıcı manuel tekrar çalıştırır. Exponential backoff, dead-letter queue gibi gelişmiş pattern'lar V2.
- **UI yok**: Bu feature CLI tabanlı; dashboard UI 006+ feature.
- **Status update yok**: `supplier_orders.status` (`Onaylandı` vs `Onay bekliyor`) ilk insert'te yazılır, sonradan değişimi V1'de takip edilmez. Edge case'i değerlendirildi (sipariş status'u Enderyapi'de "Onay bekliyor" → "Onaylandı" değişebilir); şu an `ON CONFLICT DO NOTHING` ile sabit kalır. V2'de UPDATE policy'si eklenebilir.
- **scrape_runs tablosu schema migration olarak eklenir**: Bu feature 003 sonrasında geldiği için yeni bir migration dosyası ekler; mevcut tablolara dokunmaz.
- **Tek kullanıcı + service_role**: Scraper service_role ile bağlanır, RLS bypass; tek kullanıcı varsayımı 003 ile uyumlu.
- **adapter modülleri ESM, Node.js runtime**: 002 PoC'taki `tsx` runner kullanılır; Vercel'e gitmez, Vercel runtime'a etkisi yok.
- **PoC kodu refactor edilir**: `scripts/scrape/enderyapi.ts` adapter interface'e uydurulur; mevcut helper'lar (`price-parse`, `detection`, `errors`) korunur ve yeniden kullanılır.
