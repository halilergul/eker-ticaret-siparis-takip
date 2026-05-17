# Feature Specification: Fiyat Fark Dashboard'u (Catalog Scraping + Alarm UI)

**Feature Branch**: `006-price-changes-dashboard`

**Created**: 2026-05-17

**Status**: Draft

**Input**: Halil — Enderyapı katalog sayfalarından KDV dahil özel birim fiyatları periyodik scrape ile zaman serisi olarak takip etmek; fiyatı yukarı çıkmış (zamlanmış) ürünleri dashboard'da listelemek; her ürün için fiyat tarihçesi görmek; sipariş geçmişinden bilinen ürünleri çapraz referansla "bu ürünü en son şu siparişte X TL'ye almıştın, şu an Y TL" formatında göstermek istiyor. Böylece dükkanda raf fiyatını maliyet değişimine göre güncelleyebilecek.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Zamlanan ürünler listesi (Priority: P1) 🎯 MVP

Halil dashboard'a girer, "Zamlanan Ürünler" sayfasına gider. Son N gün (varsayılan 7) içinde KDV dahil özel birim fiyatı yukarı çıkmış ürünleri tek bakışta görür: ürün adı, kodu, eski fiyat, yeni fiyat, değişim oranı (% ve mutlak fark), son sipariş anındaki fiyat. Her ürünün yanında "siparişe git" linki (en son alımına).

**Why this priority**: Projenin **temel değer önerisi**. Halil dükkanda raf fiyatını maliyete göre belirler; tedarikçi zammı geldiğinde geç haberdar olmak = kâr kaybı. Bu liste tek başına projenin yatırımını geri öder.

**Independent Test**: En az 2 snapshot bulunan (örn. başlangıç + 1 hafta sonra refresh) bir DB durumunda `/dashboard/price-changes` sayfası açılır, en az 1 ürün için fiyat farkı doğru hesaplanmış halde gözükür; aynı ürün için "siparişe git" link'i geçerli sipariş ID'sine yönlendirir.

**Acceptance Scenarios**:

1. **Given** Halil geçmişte ESP0192125 siparişinde X ürününü ₺50/PK'dan (KDV dahil) almış ve son catalog scrape'inde aynı ürün ₺55/PK olarak yazılmış, **When** Halil `/dashboard/price-changes` açar, **Then** X ürünü listede görünür: eski ₺50 → yeni ₺55 → +%10 (+₺5) Δ; "ESP0192125'e git" link'i çalışır.
2. **Given** son N gün içinde hiçbir fiyat değişikliği yok, **When** sayfa açılır, **Then** "Son 7 günde fiyat değişikliği yok" empty state mesajı gösterilir.
3. **Given** bir ürünün fiyatı **düşmüş** (zam değil, indirim), **When** sayfa açılır, **Then** bu ürün varsayılan listede gözükmez (sadece zamlananları gösterir); ama opsiyonel "indirilen ürünler" filter'ı seçilirse görünür.

---

### User Story 2 - Ürün fiyat tarihçesi (Priority: P2)

Halil zamlanan ürünler listesinden veya sipariş detayından bir ürüne tıklar; ürünün detay sayfası açılır. Üstte: ürün kodu, adı, mevcut KDV dahil özel birim fiyatı, mevcut KDV oranı. Altta: o ürün için tüm snapshot'ları tarih sırasıyla mini grafik + tablo olarak gösterir. En alta: o ürünün geçtiği siparişler kronolojik listede ("ESP0192125 — 16.05.2026 — 6 PK × ₺54,56 net = ₺392,84").

**Why this priority**: Halil "bu ürün son 3 ayda hangi seyrettte gitti?" sorusunu cevaplayabilmeli; tek bir anlık fark yetmez, eğilim önemli. Zaman içinde fiyatın salınımı görüldüğünde Halil "bu zam geçici mi, kalıcı mı" yorumu yapabilir.

**Independent Test**: En az 3 snapshot olan bir ürün için `/dashboard/products/[id]` sayfası açılır; tablo 3 satır + tarih + KDV dahil fiyat içerir; "geçtiği siparişler" bölümü en az 1 sipariş gösterir.

**Acceptance Scenarios**:

1. **Given** ürün X için 5 farklı tarihte snapshot var, **When** Halil `/dashboard/products/<id>` açar, **Then** tarihçe tablosu 5 satır gösterir; en eski en üstte değil — **en yeni başta** (DESC); değişim oranı her satırda bir önceki snapshot'a göre hesaplanır.
2. **Given** ürün X hiç sipariş edilmemiş ama catalog snapshot'ı var, **When** sayfa açılır, **Then** "geçtiği siparişler" bölümü "Bu ürün henüz sipariş edilmemiş" mesajı gösterir; tarihçe normal görünür.
3. **Given** ürünün KDV oranı bir tarihte %20'den %10'a değişmiş (örn. tedarikçi düzeltmesi), **When** sayfa açılır, **Then** her snapshot kendi anındaki KDV oranını ayrıca gösterir; karşılaştırma KDV dahil rakam üzerinden yapılır (oran değişikliği şeffaf).

---

### User Story 3 - Catalog scrape komutu (Priority: P3)

Halil terminalden `npm run scrape:catalog -- --supplier enderyapi --limit 20` komutunu çalıştırır. Komut: 004 scraper'ın login + session yönetimine bağlanır, `products` tablosunda kayıtlı her ürünü (varsa) ve/veya sipariş geçmişinden gelen ürün kodlarını gezer, her birinin catalog detay sayfasını açar, Liste Fiyatı + İskonto + KDV'siz Net Fiyat + KDV oranını parse eder, hesaplanan KDV dahil birim fiyatı `price_snapshots`'a ekler. Çıktıda: kaç ürün gezildi, kaç yeni snapshot yazıldı, kaç değişiklik tespit edildi, hangi hatalar oldu.

**Why this priority**: P1 ve P2 verisiz çalışmaz. Ama scrape **manuel komut** olarak yeterli MVP — otomasyon (cron) 008'e ertelendi (G15 ile birlikte). Halil ilk birkaç hafta manuel tetikleyerek alışkanlık kazanır.

**Independent Test**: Komut bir terminal session'da çalıştırılır, en az 1 ürün için snapshot DB'ye yazıldığı SQL ile doğrulanır, çıktı özet bilgileri yazdırır. P1 sayfası bu veriyle anlam kazanır.

**Acceptance Scenarios**:

1. **Given** `products` tablosunda 5 ürün var (sipariş scrape'inden upsert), **When** `npm run scrape:catalog -- --supplier enderyapi --limit 5` çalışır, **Then** komut başarıyla biter; `price_snapshots`'a 5 yeni satır eklenir; her satır `unit_price` (KDV dahil), `vat_rate`, `list_price` (referans için), `discount_text` (örn. "+40%+12%") içerir.
2. **Given** scrape sırasında bir ürünün catalog sayfası 404 verir (kaldırılmış), **When** komut o ürünü işler, **Then** komut crash etmez; o ürünü "skipped" olarak işaretler; diğer ürünleri işlemeye devam eder; özet "5 işlendi / 1 skipped / 0 hata" gösterir.
3. **Given** scrape sırasında login session expire olur, **When** komut bir sonraki ürünü açmaya çalışır, **Then** komut tekrar login yapar (mevcut 004 adapter pattern) veya temiz bir hatayla durur (state korumalı; tekrar denemek mümkün).

---

### Edge Cases

- **İlk scrape (sadece 1 snapshot)**: Karşılaştırılacak ikinci nokta olmadığı için P1 listesi boş kalır. Empty state "Henüz karşılaştırma için yeterli geçmiş yok — en az 2 farklı zamanlı snapshot gerekli." mesajı gösterir.
- **Ürün catalog'tan silinmiş (404)**: Snapshot eklenmez; UI'da ürünün tarihçesinde son snapshot kalır, üstte info "Bu ürün tedarikçi kataloğundan kaldırılmış görünüyor" notu eklenir.
- **KDV oranı değişikliği**: Karşılaştırma her zaman KDV dahil rakam üzerinden yapılır. Oran değişimi snapshot tarihçesinde ayrı kolon olarak görünür, kullanıcı sebebi yorumlar.
- **İskonto değişmiş ama Liste Fiyatı sabit**: Bu durumda yine KDV dahil özel fiyat değişir → liste otomatik yakalar. Görüntüde "İskonto değişti: +40+12 → +35+12" detayı ek bilgi.
- **Aynı ürün koduyla birden fazla ürün adı görünüyor** (tedarikçi tarafında snake case'de yapı değişti): Ürün kodu PK; ad değişimi sadece "Yeni isim" bilgisi olarak görüntülenir, snapshot kesintisiz devam eder.
- **TR karakter ürün adı** ("ALÇIPAN DÜBELİ", "GRİ", "İNCELME"): Detay sayfasında ve listede doğru render edilir (UTF-8 sağlam).
- **Para birimi**: V1'de TRY varsayımı sabit; başka birim çıkarsa skip + uyarı.
- **N gün penceresi**: Varsayılan 7 gün. URL search param `?days=30` ile değiştirilebilir; > 365 gün için "fazla geniş" uyarısı.
- **Yüzde hesaplaması**: Eski fiyat 0 ise (ücretsiz/promosyon ürünü) % hesaplanamaz, mutlak fark gösterilir + "%" alanı "—".

## Requirements *(mandatory)*

### Functional Requirements

**Catalog scraping**
- **FR-001**: System MUST `products` tablosuna kayıtlı (veya sipariş geçmişinden bilinen) her ürün için Enderyapı catalog detay sayfasını ziyaret eden bir scrape modu sağlamalı.
- **FR-002**: System her ürün catalog sayfasından şu alanları parse etmeli: Ürün Kodu, Ürün Adı, Marka, Liste Fiyatı, İskonto zinciri ("+X%+Y%" gibi), KDV'siz Net Fiyat, KDV oranı.
- **FR-003**: System parse edilmiş alanlardan KDV dahil özel birim fiyatı hesaplamalı: `KDV_dahil_fiyat = KDV'siz_Net_Fiyat × (1 + KDV_orani)`. Hesap kuruş hassasiyetinde yuvarlanmalı.
- **FR-004**: System hesaplanan KDV dahil fiyatı `price_snapshots` tablosuna yeni satır olarak yazmalı; her satır: ürün referansı, tarih (UTC), KDV dahil fiyat, KDV oranı, KDV hariç fiyat (referans), liste fiyatı (referans), iskonto metni (referans).
- **FR-005**: System scrape komutunu CLI argümanlarıyla yapılandırılabilir kılmalı: `--supplier <slug>`, `--limit N` (kaç ürün scrape edilecek), `--only-stale` (son snapshot N saatten eskiyse refresh).
- **FR-006**: System scrape sırasında bir ürün hatası (404, parse fail, network) tüm koşumu durdurmamalı; ürün başına başarı/başarısızlık kaydı tutmalı; toplu özet çıktıya yazmalı.
- **FR-007**: System scrape koşumlarını `scrape_runs` tablosunda audit etmeli (mevcut 004 mekanizması); status (success/partial/failed), summary JSON, başlangıç + bitiş zamanı.

**Schema**
- **FR-008**: System `products` tablosuna ürün başına KDV oranını saklayacak alan eklemeli (NUMERIC, 4 ondalık hassasiyet); örnek değer: 0.20 = %20.
- **FR-009**: System `price_snapshots` tablosuna ham parçaları (KDV hariç fiyat, liste fiyatı, iskonto metni, KDV oranı) ek alanlar olarak saklamalı — gelecekte audit ve değişiklik nedeni tespiti için.

**Dashboard — Zamlanan ürünler (P1)**
- **FR-010**: System `/dashboard/price-changes` rotasında authenticated bir sayfa sağlamalı; anonim erişim 001'in middleware'i ile `/login`'e yönlendirilir.
- **FR-011**: Page MUST son N gün (varsayılan 7) içindeki snapshot'ları kullanarak fiyatı yukarı çıkmış (`yeni > eski`) ürünleri listelemeli. Sıralama: değişim yüzdesi DESC.
- **FR-012**: List item her ürün için göstermeli: ürün kodu, ürün adı, eski fiyat (KDV dahil, formatTry), yeni fiyat (KDV dahil), mutlak fark (₺), yüzde fark (%), bağlı en son sipariş varsa "Siparişe git" link'i.
- **FR-013**: Page MUST URL search param `?days=N` ile pencere genişliğini kabul etmeli (1 ≤ N ≤ 365). Geçersiz değer → varsayılan 7.
- **FR-014**: Page MUST opsiyonel "indirilen ürünleri göster" toggle'ı sağlamalı; aktifse fiyatı düşmüş ürünler ayrı bir bölümde gösterilir.
- **FR-015**: Boş sonuç → "Son N günde fiyat değişikliği yok" empty state; en az 2 snapshot yoksa "Henüz karşılaştırma için yeterli geçmiş yok" empty state.

**Dashboard — Ürün detay + tarihçe (P2)**
- **FR-016**: System `/dashboard/products/[id]` rotasında her ürün için detay sayfası sağlamalı.
- **FR-017**: Page MUST üst kısımda mevcut bilgileri göstermeli: ürün kodu, adı, marka, mevcut KDV dahil özel birim fiyatı (son snapshot), mevcut KDV oranı.
- **FR-018**: Page MUST snapshot tarihçesini tablo halinde göstermeli — yeni başta, sütunlar: tarih, KDV dahil fiyat, bir önceki snapshot'a göre değişim (% + ₺), KDV oranı, liste fiyatı (referans), iskonto metni (referans).
- **FR-019**: Page MUST snapshot tarihçesinin görsel özet temsili (mini line chart veya sparkline) sağlamalı — 2'den az snapshot için sadece tablo, grafik yok.
- **FR-020**: Page MUST "Bu ürünün geçtiği siparişler" bölümü göstermeli: kronolojik liste (en yeni başta), her satır sipariş_no + tarih + adet × birim fiyat + sipariş detayına link.
- **FR-021**: Page MUST geçerli olmayan ürün ID (UUID format dışı veya kayıt yoksa) için 404 davranışı sağlamalı.

**Genel**
- **FR-022**: Tüm UI metni Türkçe olmalı. Sayılar tr-TR locale (`1.234,56 ₺`); tarihler tr-TR (16.05.2026 veya "X gün önce"); yüzdeler `+%12,5` formatında işaretli.
- **FR-023**: Mevcut top bar (001'den) ve middleware koruması korunmalı.
- **FR-024**: Tüm yeni DB tablolarında/kolonlarında RLS politikaları authenticated kullanıcıyı kapsamalı (003 deseni).

### Key Entities

- **Product**: Tedarikçi kataloğundaki bir SKU. Anahtar alanlar: tedarikçi referansı, ürün kodu (PK), ürün adı, marka, KDV oranı. Tek tedarikçide aynı kod 1 ürün.
- **PriceSnapshot**: Bir ürünün belirli bir andaki fiyat anlık görüntüsü. Anahtar alanlar: ürün referansı, gözlem tarihi, KDV dahil özel birim fiyat (canonical takip değişkeni), KDV hariç fiyat, liste fiyatı, iskonto metni, KDV oranı, kaynak (catalog scrape veya sipariş anı). Aynı ürün için aynı tarihte birden fazla snapshot olmamalı (idempotent).
- **ProductOrderHistory** (derived view, persisted değil): bir ürünün geçtiği siparişlerin listesi; `order_items` JOIN `supplier_orders` üzerinden hesaplanır.
- **PriceChange** (derived projection): iki snapshot arasındaki fark; UI tarafında veya SQL'de pencere fonksiyonuyla hesaplanır, ayrı tablo değil.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Halil son 7 günde fiyatı yukarı çıkmış ürünleri **2 click içinde** görür (`/login` → `/dashboard/price-changes`). [P1]
- **SC-002**: 100 ürün ve her ürün için 20 snapshot olan bir veri kümesinde `/dashboard/price-changes` ilk yükleme **<2 saniye** içinde tamamlanır.
- **SC-003**: `npm run scrape:catalog -- --supplier enderyapi --limit 20` komutu 20 ürünü **<3 dakika** içinde tamamlar (network normalse). 50 ürün < 8 dakika.
- **SC-004**: Bir ürünün KDV dahil özel birim fiyatı son scrape'te değiştiyse, sonraki `/dashboard/price-changes` açılışında **%100 doğrulukla** listelenir (yanlış pozitif veya kaçırma yok).
- **SC-005**: Halil herhangi bir ürünün son 30 günlük fiyat seyrini **3 click içinde** görür (price-changes listesi → ürün satırı → tarihçe sayfası).
- **SC-006**: Catalog scrape sırasında bir ürün başarısız olursa (404, parse fail) toplam koşum başarı oranı **≥%90** olduğu sürece P1 listesi anlamlı veriyle dolar.
- **SC-007**: TR karakter ürün adları (İ, ı, ş, ğ, ç, ö, ü) tüm listede ve detay sayfasında doğru render olur (mojibake yok).
- **SC-008**: Anonim kullanıcı `/dashboard/price-changes` veya `/dashboard/products/<id>` URL'sine direkt giderse `/login`'e yönlendirilir.
- **SC-009**: Halil sipariş detayından (`/dashboard/orders/<id>`) bir ürünün adına/koduna tıklayıp ürün tarihçesine geçebilir (cross-link); aynı şekilde ürün tarihçesinden bir siparişe geçebilir.

## Assumptions

- **Tek tedarikçi MVP**: Sadece Enderyapı için çalışır. Multi-supplier mantığı 004 adapter pattern'ı genişletilerek sonraya (007/009) ertelenir.
- **Kataloğun temel yapısı**: Enderyapı'da her ürün detay sayfasında Liste Fiyatı + İskonto + KDV'siz Net Fiyat + KDV oranı görünür alanlardır (kullanıcı PoC sırasında doğruladı). 004 US2'de DOM keşfi ertelendi → burada yapılır.
- **Login session reuse**: 004 adapter mimarisi catalog scrape için yeniden kullanılır; yeni login mekanizması gerekmez.
- **Manuel tetikleme yeterli**: Cron otomasyonu (GitHub Actions) 008'e ertelendi; v1 manuel `npm run scrape:catalog` komutu yeterli.
- **Sipariş senkronu önkoşul değil**: Catalog scrape sipariş scrape'inden bağımsız çalışabilir; ürünler `order_items` üzerinden upsert edilmişse oradan, değilse manuel olarak `products` tablosuna eklendiğinde scrape edilir.
- **TRY para birimi sabit**: V1'de tüm fiyatlar Türk Lirası varsayılır.
- **KDV oranı ürün başına**: Enderyapı'da %20 sabit görünüyor ama schema ürün başına `vat_rate` saklayarak ileride heterojen oran desteği için açık kalır.
- **Eşik yok**: V1'de "yalnızca %X üstü zamları göster" eşiği yok — listede hepsi gözükür, sıralama yüzde DESC. Eşik filtresi V2 nice-to-have.
- **Bildirim yok**: V1'de e-posta / push notification yok; Halil aktif olarak dashboard'a girer. Bildirim 010+ feature.
- **Snapshot retention**: V1'de tüm snapshot'lar sınırsız tutulur (10K satıra kadar sorun değil). Retention politikası V2+ konusu.
- **Para birimi formatı**: Tüm fiyat gösterimi `formatTry` (005'te tanımlandı) reuse edilir.
