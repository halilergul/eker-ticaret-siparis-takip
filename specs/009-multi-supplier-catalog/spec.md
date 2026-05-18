# Feature Specification: İkizler + Levent Şimşek catalog scrape (zamlanan ürünler genişlemesi)

**Feature Branch**: `009-multi-supplier-catalog`

**Created**: 2026-05-17

**Status**: Draft

**Input**: User description: "008'de ertelenen catalog scrape fazı. İkizler Hırdavat ve Levent Şimşek Armatür için catalog scrape adapter metodu yazılır; ürün kodu, ad, KDV hariç net özel fiyat, KDV oranı çekilir; mevcut price_snapshots tablosuna idempotent insert edilir. Zamlanan Ürünler dashboard'u 3 tedarikçinin de fiyat değişikliklerini gösterir. Adapter mimarisi mevcut (008'de İkizler + Levent için login + listOrders + getOrderDetail tamamlandı). Catalog değişim alarmı (e-posta/push) YOK — 010'a ertelendi."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - İkizler ürünlerinin "Zamlanan Ürünler" dashboard'unda görünmesi (Priority: P1)

Eker Ticaret çalışanı `/dashboard/price-changes` sayfasına gittiğinde tedarikçi filtresinden **"İkizler Hırdavat"** seçer. Son N gün (varsayılan 7) içinde fiyatı yukarı çıkmış İkizler ürünleri liste halinde görünür: ürün kodu, ad, eski KDV dahil özel fiyat, yeni KDV dahil özel fiyat, mutlak fark, yüzde fark. Her ürünün yanında ilgili son siparişe link (varsa). En az 2 farklı tarihte snapshot alınmış olmalı.

**Why this priority**: 006 ile Enderyapı için kurulan "fiyat takip" değer önerisi, projenin **temel amacı**. İkizler Eker'in sık alım yaptığı tedarikçi → onların ürünleri için fiyat değişimi görmeden dashboard yarım kalıyor. Levent Şimşek ile aynı önem.

**Independent Test**: İkizler hesabı için credentials .env.local'da → `npm run scrape:all -- --supplier ikizler` (catalog phase çalışır, --skip-catalog YOK) → DB'de `price_snapshots` tablosuna İkizler ürünleri için yeni satırlar → 24 saat sonra ikinci koşum → en az 1 fiyat değişikliği varsa `/dashboard/price-changes?supplier=ikizler` ekranında o ürün listede görünür.

**Acceptance Scenarios**:

1. **Given** İkizler hesabında geçmişte ≥10 ürün sipariş edilmiş ve credentials geçerli, **When** catalog scrape ilk kez çalışır, **Then** her ürün için 1 snapshot satırı `price_snapshots`'a yazılır (`unit_price` KDV dahil özel fiyat); koşum `Başarılı` statusüyle biter.
2. **Given** ilk catalog scrape tamamlanmış (snapshot N=1) ve 1 hafta sonra 2. scrape çalışmış (snapshot N=2), **When** İkizler tedarikçi filtresi ile `/dashboard/price-changes` açılır, **Then** fiyatı yukarı çıkmış ürünler listede görünür; sıralama yüzde fark DESC.
3. **Given** İkizler catalog sayfası bulunamadı (404 veya selector kırık), **When** catalog scrape çalışır, **Then** catalog fazı `Başarısız` (parse-failed mode), **ancak orders fazı bağımsız tamamlanır** — orders verisi etkilenmez; koşum özetinde "orders: success, catalog: failed" ayrı raporlanır.
4. **Given** İkizler için aynı ürün/aynı gün/aynı fiyat zaten DB'de, **When** scrape tekrar çalışır, **Then** snapshot satırı eklenmez (`snapshots_inserted=0, snapshots_skipped=N`) — idempotent davranış.

---

### User Story 2 - Levent Şimşek ürünlerinin "Zamlanan Ürünler" dashboard'unda görünmesi (Priority: P1)

Yukarıdaki US1 ile aynı akış, ama bu kez **"Levent Şimşek Armatür"** tedarikçisi için. Tedarikçi filtresinden Levent Şimşek seçildiğinde armatür kategori ürünlerinin fiyat değişimleri listelenir.

**Why this priority**: Armatür kategorisi Levent Şimşek üzerinden geliyor; bu kategoride zamlar genellikle parça parça olur (her ay 2-3 ürün). İkizler ile **paralel** implement edilebilir (farklı adapter dosyaları, farklı DOM keşfi).

**Independent Test**: Levent Şimşek credentials → `npm run scrape:all -- --supplier leventsimsek` (catalog phase çalışır) → DB'de Levent Şimşek ürünleri için snapshot satırları → `/dashboard/price-changes?supplier=leventsimsek` filtresi çalışır.

**Acceptance Scenarios**:

1. **Given** Levent Şimşek hesabı aktif ve geçmiş siparişlerden ≥5 farklı ürün biliniyor, **When** catalog scrape çalışır, **Then** her ürün için snapshot eklenir; ürün adı + kodu + KDV dahil özel fiyat alanları doğru yazılır.
2. **Given** Levent Şimşek DOM yapısı İkizler veya Enderyapı'dan farklı (PHP tabanlı), **When** catalog scrape edilir, **Then** çıktı `price_snapshots`'a aynı şemada yazılır — UI gözünde "Zamlanan Ürünler" sayfası fark görmez (tedarikçi adı + kod farkı dışında).
3. **Given** bir ürünün catalog sayfasında KDV oranı görünmüyor, **When** parse edilir, **Then** sistem default %20 KDV varsayar (Enderyapı kararı ile uyumlu), kullanıcı log/snapshot'tan oranın varsayım olduğunu görebilir.

---

### User Story 3 - 3 tedarikçi için otomatik catalog refresh (Priority: P2)

Settings sayfasında her tedarikçi için aç/kapa toggle ve saat ayarı bağımsız çalışır. Halil 3 tedarikçinin de otomatik tetiklemesini aktive ettiğinde her gün ilgili saatte catalog phase de orders phase ile birlikte çalışır. Bir tedarikçinin catalog scrape'i başarısız olsa bile diğer tedarikçilerin koşumu etkilenmez (concurrency.group: scrape-${supplier}); ayrıca aynı tedarikçinin catalog hatası orders koşumunu **aynı tedarikçi içinde dahi** etkilemez (orchestrator izolasyonu).

**Why this priority**: V1'de manuel "Şimdi tetikle" yeterli (US1, US2). Otomatik tetikleme zaten 007'de kurulmuş altyapıyı kullanıyor — kod değişikliği yok, sadece doğrulanmalı.

**Independent Test**: 3 tedarikçi de aktive → 24 saat sonra `scrape_runs` tablosunda 3 ayrı `trigger_type='auto'` satır görünür; her birinde catalog özet alanları (snapshots_inserted, snapshots_skipped) dolu.

**Acceptance Scenarios**:

1. **Given** 3 tedarikçi de `enabled=true` farklı saatlerde, **When** 24 saat geçer, **Then** her tedarikçi için catalog snapshot satırları DB'de görünür; "Son koşumlar" UI'da 3 ayrı otomatik koşum kaydedilir.
2. **Given** İkizler catalog scrape başarısız, **When** koşum biter, **Then** koşum status'u "Kısmen başarılı" veya "Başarısız" (UI tasarımına göre); orders satırları gene de DB'ye yazıldıysa orders listesi normal görünür; sonraki manuel/otomatik tetiklemede tekrar denenir.

---

### Edge Cases

- **Catalog sayfası bilinmiyor**: İkizler ve Levent Şimşek için "ürün catalog'u nerede?" sorusu DOM keşfi sırasında cevaplanır. Eğer site dropdown menüsünde "Katalog" / "Ürünler" linki bulunamazsa, sipariş geçmişinden bilinen ürün kodları üzerinden **arama** (search) sayfası kullanılabilir; bu durum geliştirici notuna eklenir.
- **Ürün catalog'da yok ama siparişlerde var**: Tedarikçi catalog'tan bir ürünü çıkarmış olabilir. Snapshot eklenmez; ürün detay sayfasında (006/US2) "Bu ürün tedarikçi kataloğundan kaldırılmış görünüyor" notu zaten var.
- **KDV oranı parse edilemiyor**: Default %20 kabul edilir (Enderyapı'da da aynı default). Snapshot bu varsayımla yazılır.
- **Pagination**: İkizler veya Levent Şimşek catalog'unda pagination varsa adapter "Sonraki sayfa" linkini takip etmeli; aksi halde sadece ilk sayfa kataloglanır (eksik).
- **Login session expire (catalog phase)**: Catalog scrape uzun sürebilir (3-10 dk). Adapter login session'ı yenilemeyebilir → ortada hata oluşur. Adapter "session-expired" mode'uyla fail ederse koşum tekrar denenmeli (bu V1'de kullanıcı manuel; otomatik retry V2).
- **Sipariş geçmişinde olmayan ürün (cold catalog)**: V1'de catalog scrape **yalnızca sipariş geçmişinden bilinen ürünleri** kapsar (Enderyapı/006 ile aynı kural). Tüm site katalog'unun crawl'ı V2+ konusu.
- **Aynı ürün farklı kategoriler altında**: Ürün kodu primary key — kategori bilgisi snapshot'a kaydedilmez, ürün adı/kod yeterli.
- **TR karakter ürün adı**: 006'da kanıtlanmış UTF-8 sağlam → yeni adapter'lar aynı pattern.
- **Cross-supplier eşleştirme YOK**: Aynı ürün (örn. "M8 Galvaniz Civata") iki tedarikçide farklı kodlarla satılıyorsa, V1'de bunlar **ayrı ürün** kabul edilir. Cross-supplier SKU normalize V2+.

## Requirements *(mandatory)*

### Functional Requirements

**Catalog scrape — adapter metodu:**

- **FR-001**: Sistem; İkizler Hırdavat (`http://bayi.ikizlerhirdavat.com`) ve Levent Şimşek Armatür (`https://liste.leventsimsekarmatur.com`) için **catalog scrape** yeteneği sağlamalı — her ürün için: ürün kodu, ürün adı, KDV hariç net özel birim fiyat, KDV oranı (mümkünse), liste fiyatı (referans, mümkünse), iskonto metni (referans, mümkünse).
- **FR-002**: Sistem; her tedarikçinin catalog scrape metodu (`scrapeCatalog`) **mevcut Adapter interface'ini** uygulamalı — Enderyapı (006) ile aynı kontrat; orchestrator (`scripts/scrape/all.ts`) bu metodu otomatik çağırmalı.
- **FR-003**: Sistem; catalog scrape **yalnızca sipariş geçmişinden bilinen ürünleri** kapsamalı (V1 scope). Yeni tedarikçi için ürün listesi `order_items` üzerinden distinct ürün kodlarıyla belirlenir.

**Veri yazma — idempotency:**

- **FR-004**: Sistem; her ürün için KDV dahil özel birim fiyatı **`KDV_hariç × (1 + KDV_oranı)`** formülüyle hesaplamalı ve mevcut `price_snapshots` tablosuna yeni satır olarak yazmalı.
- **FR-005**: Sistem; aynı ürün + aynı gün + aynı fiyat kombinasyonu için **çift snapshot yazmamalı** — idempotent davranış (snapshot zaten varsa skip).
- **FR-006**: Sistem; catalog scrape sonuçlarını `scrape_runs` tablosu özet alanlarında (`snapshots_inserted`, `snapshots_skipped` veya benzer) raporlamalı; UI "Son koşumlar"da bu sayılar görünür.

**Hata izolasyonu:**

- **FR-007**: Sistem; catalog scrape başarısızlığı (selector kırık, pagination fail, vb.) **aynı koşumun orders fazını engellemez** — orchestrator catalog ve orders fazlarını ayrı izole eder (006'dan kalan altyapı; doğrulanmalı).
- **FR-008**: Sistem; bir tedarikçinin catalog scrape başarısızlığı **diğer tedarikçilerin koşumunu etkilemez** — workflow level'da `concurrency.group: scrape-${supplier}` zaten ayrı tutuyor.

**UI (otomatik):**

- **FR-009**: `/dashboard/price-changes` sayfasındaki tedarikçi filtresi **otomatik olarak** 3 tedarikçiyi (Enderyapi + İkizler + Levent Şimşek) seçenek olarak göstermeli — UI kod değişikliği gerekmemeli (suppliers tablosu seed sonrası DB-driven).
- **FR-010**: `/dashboard/products/[id]` ürün detay sayfası, yeni tedarikçilerin ürünleri için de **tarihçe + grafik** bölümünü çalıştırabilmeli — şema farkı yok, mevcut 006 sayfası kod değişikliği gerektirmez.

**Adapter mimari yaklaşımı:**

- **FR-011**: Her tedarikçi için catalog selector ve URL bilgileri **mevcut per-adapter constants dosyasına** (`lib/scraper/adapters/<slug>.constants.ts`) eklenmeli — 008'de kurulan pattern korunur.
- **FR-012**: Catalog scrape'in DOM keşfi **iteratif** yapılır (008'deki diag script → constants → test pattern); keşif sırasında screenshot dump ve selector denemeleri kabul edilir, sonuçta production code temiz olur (diag script'ler silinir veya gitignore'lanır).

**Güvenlik:**

- **FR-013**: Catalog scrape **aynı credentials** (008'de zaten kurulan `IKIZLER_USERNAME/PASSWORD`, `LEVENTSIMSEK_USERNAME/PASSWORD`) kullanmalı; yeni secret eklenmez.
- **FR-014**: Catalog scrape hataları (parse fail, 404, vb.) loglarında kullanıcı adı/şifre **kesinlikle görünmemeli** — failure-mode etiketleri yeterli (008/FR-011 ile tutarlı).

**Test:**

- **FR-015**: Her adapter için manuel test akışı (`scrape:all --supplier <slug>` catalog phase dahil) yerel ortamda çalışabilmeli; production deploy öncesi geliştirici test edebilmeli.

### Key Entities

Bu feature mevcut DB şemasını **kullanır** (yeni tablo eklenmez):

- **`price_snapshots`**: Her ürün için yeni satır eklenir (mevcut yapı; `product_id` FK üzerinden ürüne bağlı). Alanlar: id, product_id, captured_at, unit_price (KDV dahil özel birim fiyat — canonical), currency.
- **`products`**: Yeni satır eklenebilir (catalog'da bilinen ama henüz sipariş edilmemiş ürün için), ancak V1'de scope yalnızca sipariş geçmişinden bilinen ürünler — yeni satır çoğunlukla eklenmez.
- **`scrape_runs`**: Mevcut yapı; catalog özet alanları (snapshots_inserted, snapshots_skipped) varsa kullanılır; yoksa generic summary JSON alanına eklenir (006'dan kalan yapı doğrulanmalı).

**Yeni tablo, yeni RPC, yeni RLS politikası gerekmez** — şema yeterli.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Her iki tedarikçi (İkizler + Levent Şimşek) için ilk manuel catalog scrape **production ortamında 10 dakika içinde** tamamlanmalı ve "Başarılı" statusüyle bitmeli (≥5 ürünün catalog sayfasını gezdiği varsayımıyla).

- **SC-002**: Zamlanan Ürünler dashboard'unda (`/dashboard/price-changes`) tedarikçi filtresinde 3 tedarikçi (Enderyapi + İkizler + Levent Şimşek) **otomatik olarak** seçilebilmeli; her biri seçildiğinde **yalnız o tedarikçinin** ürünlerini göstermeli.

- **SC-003**: İkizler veya Levent Şimşek ürünlerinden en az birinin KDV dahil özel birim fiyatı (B2B sitedeki değer) **DB'deki son snapshot'la birebir eşleşmeli** (en az 3 örnek ürünün manuel karşılaştırması, ±0,01 ₺ tolerans yuvarlama için).

- **SC-004**: Aynı catalog scrape ardarda 2 kez çalıştırıldığında **idempotent** olmalı — ikinci koşumda `snapshots_inserted=0, snapshots_skipped=N` (aynı gün/aynı fiyat).

- **SC-005**: İkizler veya Levent Şimşek catalog scrape başarısızlığı **aynı koşumun orders fazını engellemez** — koşum özetinde "orders: success, catalog: failed" ayrı görünmeli; orders verisi DB'ye yazılmış olmalı.

- **SC-006**: Bir tedarikçinin catalog scrape hatası **diğer tedarikçilerin koşumunu etkilemez** — 3 tedarikçinin de otomatik koşumu aynı gün çalıştığında, biri başarısız olsa bile diğer ikisi tamamlanmış olmalı.

- **SC-007**: Bu feature'ın aylık compute maliyeti **0 TL kalmalı** — GitHub Actions free tier (2000 dk/ay) içinde, 3 tedarikçi × günlük 1 cron tetiklemesi × (orders 5 dk + catalog 5 dk) = ~10 dk × 3 × 30 = ~900 dk/ay rahat sığar.

## Assumptions

- İkizler ve Levent Şimşek B2B siteleri **ürün catalog/detay sayfası** sunuyor (kullanıcı doğrulayacak). Catalog URL'leri DOM keşfi sırasında bulunur — kullanıcı manuel olarak siteye girip URL'yi paylaşabilir veya diag script tespit eder.
- **Catalog scope yalnızca sipariş geçmişinden bilinen ürünler** — tüm site catalog'unun crawl'ı V1'de YOK (Enderyapı/006 ile aynı kural). Tedarikçi ile alım yapılmamış ürünler dashboard'da görünmez.
- **KDV oranı default %20** — eğer catalog sayfasında KDV görünmüyorsa Enderyapı kararı ile uyumlu default kullanılır. Heterojen KDV oranları catalog scrape sırasında parse edilebilirse `vat_rate` alanına yazılır.
- **Catalog değişim alarmı (e-posta/push) YOK** — sadece dashboard'da görünür. Bildirim **010 feature'ı** olarak ertelenir.
- **Cross-supplier ürün eşleştirme YOK** — aynı ürün iki tedarikçide farklı kodlarla varsa V1'de ayrı izlenir.
- **Adapter `scrapeCatalog` metodu opsiyonel kalır** — 008'de İkizler/Levent için `return null` placeholder vardı; bu feature gerçek implementasyonu getirir. Enderyapı'nın mevcut catalog scrape metodu **dokunulmaz**.
- **DOM keşfi iteratif** — geliştirici her site için 2-4 saatlik selector tespit + test fazı bekler (008'de İkizler 4 saat, Levent Şimşek 6 saat sürmüştü).
- Mevcut "Şimdi tetikle" UI butonu ve cron altyapısı (007/008) yeni catalog phase'i için **otomatik olarak çalışır** — orchestrator adapter'da `scrapeCatalog` varsa zaten çağırıyor (006 davranışı).
- Mevcut "Zamlanan Ürünler" sayfası (006) yeni tedarikçilerin ürünleri için **otomatik olarak filtreleme + listeleme** yapar — UI kod değişikliği gerekmez (suppliers DB-driven).
- Mevcut Constitution kararları (G15 GitHub Secrets, G16 DB schedule, 008'deki HTTP plaintext risk kabulü) bu feature'da aynı uygulanır — yeni mimari karar gerekmez.
- **Pagination olabilir veya olmayabilir** — her iki tedarikçi catalog/arama sayfasında pagination varsa adapter takip etmeli; yoksa tek sayfa yeterli. Keşif sırasında tespit edilir.
