# Research: 009 İkizler + Levent Şimşek catalog scrape

**Date**: 2026-05-17 | **Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

Spec'te `[NEEDS CLARIFICATION]` yok; bu döküman teknik karar gerekçelerini, alternatifleri ve referans bağlamı kaydeder. 006 ve 008 deneyimi temel referans.

---

## R-001 — İkizler catalog URL pattern (search vs direct navigate)

**Decision**: İki kademeli — önce `RawOrderItem.catalogUrl` cache'inden direkt navigate, miss/null ise **search endpoint** (ürün kodu ile site içi arama → ilk sonucun detay sayfası).

**Rationale**:
- 008'de keşfedildi: İkizler sipariş listesi `/Home/Belgeler?BelgeTipDetayID=134` üzerinde, ASP.NET MVC pattern. Ürün catalog'u büyük olasılıkla aynı `/Home/` veya `/Urun/` controller altında.
- Ürün başına direkt URL pattern (ör. `/Urun/Detay/<id>` veya `?UrunID=N`) ürün ID'ye bağlı; ürün kodundan (text) deterministik üretilemez → search gerekli.
- Search endpoint olasılıkları: `/Home/Arama?q=<code>`, `/Urun/Ara?kod=<code>`, üst navigation'da arama kutusu (`<input type="search">`) → form submit. Keşif faz 0'da bulunacak.
- 006'da Enderyapı'da `navigateBySearch(ctx, code)` pattern'i çalıştı; aynı yaklaşım reuse edilir (`enderyapi.ts:874`).

**Alternatives considered**:
- *Sadece direct URL pattern*: Eğer ürün kodu URL pattern'de doğrudan kullanılıyorsa (ör. `/Urun/<code>`) search atlanır. Keşif sırasında doğrulanır; bulunursa adapter onu tercih eder.
- *İkili pas (önce search, sonra cache)*: İlk koşum yavaş olur ama her ürünün catalog URL'si DB'ye yazılır → ikinci koşum hızlı. 006 Enderyapı pattern'i ile aynı.

**Discovery**: → [contracts/ikizler-catalog-discovery.md](contracts/ikizler-catalog-discovery.md)

---

## R-002 — Levent Şimşek catalog URL pattern

**Decision**: Aynı iki kademeli pattern — cache (`RawOrderItem.catalogUrl`) → search. PHP query-string pattern beklentisi yüksek.

**Rationale**:
- 008'de keşfedildi: Levent Şimşek sipariş listesi `/?p=showorder&mode=normal`; sipariş detayı **modal** olarak açılıyor (`Detaylar` butonu). PHP `index.php?p=<action>` deseni baskın.
- Catalog endpoint olasılıkları: `?p=showproducts`, `?p=urun_listesi`, `?p=urun_detay&id=N`, `?p=search&q=<code>` — keşif sırasında bulunacak.
- Modal-based detail keşfedildi (008 leventsimsek.ts:detailCache pattern'i) → catalog detayı da modal olabilir. Modal ise: `Detaylar` butonu yerine **ürün adı** veya **ürün kodu**'na tıklamak modal açar → modal içeriğinden fiyat alanları parse.
- Eğer catalog sayfası yoksa (örn. site sadece sipariş listesi gösteriyor olabilir, "katalog" page'i yoksa) → adapter `scrapeCatalog` 0 sonuç döner, `Başarısız (catalog-not-supported)` mode'uyla biter; UI'da bilgilendirme.

**Alternatives considered**:
- *Order detail modal'ından fiyat snapshot al*: 008'de modal'da ürün kodu + miktar + birim fiyat zaten parse edildi. Bu fiyatlar **sipariş anındaki** fiyatlar — `price_snapshots.source='order'` ile ham olarak işaretlenebilir. Ama "güncel catalog fiyatı" sorununu çözmüyor. **Catalog page YOK ise** bu fallback değerli; ama yine de search/listing endpoint denenmeli (catalog yok kararı atlamak için erken kabul olur).

**Discovery**: → [contracts/leventsimsek-catalog-discovery.md](contracts/leventsimsek-catalog-discovery.md)

---

## R-003 — Catalog detay sayfası selector keşif stratejisi

**Decision**: 008'deki **iteratif diag script** pattern'i — önce `--headed` Playwright + tam sayfa screenshot dump → DOM parse + CSS class/id tespit → constants array. Text-tabanlı arama **son çare**.

**Rationale**:
- 006 deneyimi: Enderyapı catalog'unda fiyat alanları text label (`Liste Fiyatı:`, `KDV'siz Net Fiyat:`) yerine **CSS class id'leri** (`.normalprice-id`, `.price-id`, `.tax-id`, `.discount-id`) ile yakalandı. Unicode apostrof (`'`) text arama'yı bozmuştu (memory: `project-eker-bayipro-catalog-dom`).
- İkizler ve Levent Şimşek farklı platformlar — class isimleri farklı olabilir ama prensip aynı: önce **DOM dump** + **CSS keşfi** → selector array.
- Diag script'ler keşif sırasında kullanılır, production code'a girmez. `scripts/scrape-debug/<runId>/` altına HTML dump + PNG screenshot — production deploy öncesi silinir veya `.gitignore`'a alınır.

**Selector aday hiyerarşisi**:
1. **CSS id** (`#fiyat`, `#kdv` gibi) — en güvenilir
2. **CSS class** (`.price`, `.list-price` gibi) — yaygın
3. **Data attribute** (`[data-price]`) — modern siteler
4. **Tablo hücresi** (`table.detay td:nth-child(2)`) — eski PHP/ASP siteler
5. **Text label** (`text=Liste Fiyatı` veya regex) — son çare

**Alternatives considered**:
- *Tek geçişte tüm site catalog'unu crawl*: Hız faydası az (sipariş'ten bilinen ürünler zaten az ~5-30), risk yüksek (rate limit, IP ban). 006 kuralı korunur: sadece bilinen ürünler.

---

## R-004 — `RawOrderItem.catalogUrl` yakalama stratejisi

**Decision**: Her adapter'ın `getOrderDetail` metoduna **opsiyonel ikinci pas** eklenir — order_items satırlarında ürün adı/kodu **link mi**? Linkse `href` yakalanır ve `RawOrderItem.catalogUrl` doldurulur. Yoksa `null` döner ve catalog scrape sırasında search'e düşülür.

**Rationale**:
- Enderyapı (`enderyapi.ts:525-555`) bu pattern'i kullanıyor: order detay satırlarında ürün kodu/adı anchor (`<a>`) tag'i içindeyse `href` capture edilir.
- İkizler/Levent Şimşek ürün satırlarında link var mı? **Bilinmiyor** — keşif faz 0'da doğrulanır. Eğer:
  - **Var** → `catalogUrl` doldurulur; sonraki catalog scrape `target.catalogUrl` cache hit ile **search bypass** eder (hızlı: ~3-5 sn/ürün).
  - **Yok** → `catalogUrl: null`; her catalog scrape search yapar (yavaş: ~10-15 sn/ürün, ama fonksiyonel).
- Bu opsiyonel optimizasyon — V1 için zorunlu değil. Performans hedefi (SC-001: 10 dk için ≥5 ürün) search-only'de bile karşılanır.

**Alternatives considered**:
- *Catalog scrape sırasında URL'yi keşfet ve `products.catalog_url`'a yaz*: Enderyapı orchestrator zaten bunu yapıyor (`scripts/scrape/all.ts:268`). Yeni adapter'lar için aynı kanal — adapter `CatalogScrapeResult.catalogUrl` döner, orchestrator `products.catalog_url`'a yazar (idempotent UPSERT 006'dan). Bu sayede:
  - 1. koşum: search ile bulur + DB'ye yazar
  - 2. koşum: DB'den okur + direkt navigate
- Bu pattern zaten kurulu; yeni adapter sadece `CatalogScrapeResult.catalogUrl` alanını doğru doldurmalı.

---

## R-005 — KDV oranı catalog sayfasında parse edilemezse fallback

**Decision**: Adapter default %20 KDV ile snapshot döner. `vatRate: 0.20` hard-coded fallback; `discountText` veya başka bir alanda "%20 KDV varsayıldı" markeri opsiyonel.

**Rationale**:
- 006/Enderyapı: `vatRate === null` → `vat-rate-missing` mode → snapshot eklenmez (`results.push({ ok: false, mode: 'vat-rate-missing' })`). Bu konservatif — KDV bilinmeden KDV dahil fiyat hesaplanmaz.
- İkizler ve Levent Şimşek için spec FR-004 + edge case "KDV oranı parse edilemiyor" → default %20 kabul. Bu durum farklı — adapter'a karar bırakılır:
  - **Enderyapı pattern'i (konservatif)**: parse edilemezse fail. Avantaj: yanlış %20 ile snapshot yazmazsın.
  - **Spec kararı (pragmatik)**: parse edilemezse default %20 ile snapshot yaz. Avantaj: dashboard'da ürün görünür kalır.
- **Karar: spec ile uyumlu — default %20 ile snapshot**. Çünkü 008 memory'de kullanıcı doğruladı: tüm 3 tedarikçide KDV %20 sabit (`project-eker-vat-pricing-model`).
- Adapter konsoluna `vat: default %20 (parse missed)` log düşülür → kullanıcı sebep görür.

**Alternatives considered**:
- *Enderyapı pattern'i kopya*: 006 davranışı korunur, yeni adapter'lar da fail. Tutarlılık iyi ama dashboard veri kaybı.
- *İlk başarılı parse'ta KDV'yi `products.vat_rate`'a cache'le*: Sonraki koşumlarda parse missed ise DB'den oku. 006'da `products.vat_rate` zaten var (`vat_rate numeric` kolonu). Bu daha akıllı; ancak ek karmaşıklık. V1'de **basit %20 hard-coded fallback** yeterli.

---

## R-006 — Liste fiyatı + iskonto metni parse edilemezse davranış

**Decision**: Bu iki alan **opsiyonel** — `null` döner, snapshot yine yazılır. Yalnızca `unitPriceExclVat` (KDV hariç net fiyat) zorunlu.

**Rationale**:
- `price_snapshots.list_price` ve `discount_text` 006 migration'ında `nullable` olarak yapılandı (referans/audit alanı, hesaplamada kullanılmıyor).
- Canonical takip değişkeni: **KDV dahil özel birim fiyat** (`unitPriceWithVat = unitPriceExclVat × (1 + vatRate)`). Bu hesaplanabilir olduğu sürece snapshot anlamlı.
- Liste fiyatı + iskonto metni "audit / değişiklik nedeni tespiti" için (`plan.md`/006 complexity tracking): "İskonto değişti mi yoksa liste mi değişti?" sorusunu cevaplama. Yoksa cevap "bilinmiyor" — kabul edilir.

**Alternatives considered**:
- *Hepsini zorunlu yap*: Strict, ama yeni siteler bu alanları her zaman sunmuyor olabilir (ör. PHP sitelerinde "iskonto" görünmüyor olabilir; sadece "müşteriye özel net fiyat"). Snapshot'ı kaybetmek aşırı.

---

## R-007 — Marka/brand alanı opsiyonel — null kabul

**Decision**: `brand` alanı opsiyonel; parse edilemezse `null` döner. Ürün adında genelde marka bilgisi yer alır → ayrı `brand` alanı bonus.

**Rationale**:
- Enderyapı adapter'ında brand `[alt][title]` filter ile yakalanıyor (`enderyapi.ts:914-920`); spesifik bir görsel attribute pattern'i. İkizler ve Levent için bu pattern uymuyor olabilir.
- `products.brand` 003 schema'sında nullable. UI tarafında 006 sayfası brand bilgisini ürün adından bağımsız göstermiyor (sadece referans).

**Alternatives considered**:
- *Brand'ı ürün adından regex ile çıkar*: Marka isimleri çeşitli (Tofaş, Vibo, Bosch, ...); regex unreliable. Atla.

---

## R-008 — Pagination olasılığı

**Decision**: V1'de catalog scrape `targets: CatalogScrapeTarget[]` listesini alır — orchestrator zaten `products` tablosundan distinct ürün kodlarını çekiyor (`scripts/scrape/all.ts:130-135`). Pagination **adapter-internal** problem değil.

**Rationale**:
- Catalog scrape **bilinen ürün listesi** üzerinde çalışıyor (FR-003). Her ürün için detay sayfasına direkt navigate (cache veya search) — adapter pagination ile uğraşmaz.
- Spec edge case "pagination" — full catalog crawl yaparsak gerekli. **V1'de full catalog crawl YOK** (Assumptions). Yani pagination uyumsuz/relevant değil.
- İstisna: search sonuç sayfası 0 sonuç dönerse pagination'a düşmeden direkt fail (`product-not-found` mode).

**Alternatives considered**:
- *Tam catalog crawl + pagination support*: V2+ feature. Çok daha geniş scope (rate limit, bot detection riski, çok fazla "ilgisiz" ürün). V1'de gerekmez.

---

## Referans bağlam

- **006 deneyimi**: Enderyapı catalog scrape — text-tabanlı arama Unicode apostrof yüzünden kırıldı; CSS class çözüm. Memory: `project-eker-bayipro-catalog-dom`.
- **008 deneyimi**: İkizler/Levent Şimşek order scrape — iteratif DOM keşfi (diag script → constants → test). Yeni: Levent Şimşek modal-based detail (detailCache pattern). `__name is not defined` ESLint hatası tsx/esbuild evaluate body için (gotchas.md kayıtlı).
- **Mevcut adapter referansı**: `lib/scraper/adapters/enderyapi.ts:850-980` (`scrapeCatalog` reference impl, ~130 satır).
- **Orchestrator**: `scripts/scrape/all.ts:221-300` (`catalogPhase` function, adapter-driven).
- **Snapshot writer**: `lib/scraper/supabase-writer.ts:372` (`writePriceSnapshot`).
- **Spec FR'leri**: FR-001 ile FR-015; FR-003 (catalog scope = sipariş'ten bilinen ürünler), FR-007 (catalog hata izolasyonu).
