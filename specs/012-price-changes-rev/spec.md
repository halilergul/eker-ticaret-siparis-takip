# Feature Specification: Zamlanan Ürünler — Son Sipariş Bazlı Birikimli Zam Takibi

**Feature Branch**: `012-price-changes-rev`

**Created**: 2026-06-20

**Status**: Draft

**Input**: User description: "İşletmedeki ürünler bazen 1 sene rafta durabiliyor. Bu süre içinde tedarikçi aynı ürüne birden fazla zam uygulayabiliyor. /dashboard/zamlanan-urunler sayfasındaki 'son 30/60/90 gün' filtresi bu durumu yakalayamıyor. Karşılaştırma temeli operatörün bir önceki siparişte ödediği fiyat olmalı (snapshot pencere değil)."

---

## Problem & Motivation

Eker Ticaret (nalbur) bir ürünü tedarikçiden aldıktan sonra mağazada uzun süre satabiliyor — bazen 1 yıla varan stok dönüş süresi. Bu süre boyunca tedarikçi aynı ürüne **birden fazla zam** uygulayabiliyor (örn. Şubat'ta %5, Mayıs'ta %8, Eylül'de %12 → toplam ~%27 birikimli).

Operatör (Halil) için kritik soru: **"Bu ürünü son aldığım fiyatla bugünkü tedarikçi fiyatı arasındaki farkı görüyor muyum?"**

Mevcut `/dashboard/zamlanan-urunler` sayfası bu soruya cevap **veremiyor**:

- Karşılaştırma penceresi "son 30/60/90 gün" snapshot karşılaştırması — operatörün kendi alım anı baz değil.
- Ürün son N günde fiyat değişmediyse görünmüyor; ama 6 ay önce alınan ve bugün hâlâ raftaki bir ürün tedarikçide zamlandıysa **operatör bunu kaçırıyor**.
- Pencere içindeki ilk-son delta'sı operatörün **gerçek kayıp/kar maaliyetini** ölçmüyor.

**Sonuç**: Operatör bir sonraki sipariş yapacağı zaman güncel fiyatı görür ama "bu ürüne kıyasla geçen sefer ne kadar ödedim, şimdi ne kadar fazla ödeyeceğim" sorusu kör. Stok değerleme, satış fiyatı belirleme ve tedarikçi pazarlığı için bu fark hayati.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Son alımdan bu yana zammı görme (Priority: P1)

**Persona**: Operatör (Halil) — bir sonraki tedarikçi siparişini hazırlarken hangi ürünlerin zamlandığını ve ne kadar zamlandığını görmek istiyor.

**Senaryo**: Operatör `/dashboard/zamlanan-urunler` sayfasını açar. Karşısında, **son sipariş anındaki birim fiyatı bugünkü tedarikçi fiyatından daha düşük** olan tüm ürünleri görür — pencere kısıtı yok. Her satırda son alış tarihi + son alış fiyatı + bugünkü fiyat + delta (TL ve %) yer alır.

**Why this priority**: Bu feature'ın temel iş değeri. Operatörün bir sonraki alım kararını verirken kayıpları takip edebilmesi için zorunlu.

**Independent Test**: Bir tedarikçide bilinen bir zamlanan ürünü manuel kontrol et: dashboard satırı son sipariş tarihindeki `unit_price_at_order`'i ve bugünkü tedarikçi catalog fiyatını gösteriyor + delta doğru hesaplanmış.

**Acceptance Scenarios**:

1. **Given** Yedekler EKL2025-0034 ürünü 12.09.2025 tarihinde 38.50 TL/ad (KDV hariç) alındı ve bugün tedarikçi catalog'unda 56.70 TL/ad, **When** operatör Zamlanan Ürünler sayfasını açar, **Then** ilgili satır görünür: son alış 38.50 / bugün 56.70 / delta +18.20 TL (+%47.3).
2. **Given** Aynı ürün 12.09.2025 ve 03.02.2026'da iki kez alındı (40 TL ve 45 TL), **When** sayfa açılır, **Then** karşılaştırma temeli **en son sipariş** (03.02.2026, 45 TL); 12.09.2025 sipariş gözardı edilir.
3. **Given** Bir ürün son alındığı tarihteki fiyat 100 TL idi ve bugün hâlâ 100 TL (zam yok), **When** sayfa açılır, **Then** o ürün listede görünmez.
4. **Given** Son alış 100 TL, bugün 95 TL (fiyat düştü), **When** sayfa açılır, **Then** o ürün listede görünmez (düşüşler V1 kapsamında değil).

---

### User Story 2 — Pencere filtresi kaldırılması (Priority: P1)

**Persona**: Operatör — "son 30 gün / 60 gün / 90 gün" toggle'ı kafa karıştırıcı bulmuş; pencere kavramı problemi çözmüyor.

**Senaryo**: Sayfa açıldığında "Son N gün" toggle'ı yok. Yerine **tedarikçi filtresi** ve **minimum zam %** filtresi (chip preset'ler) var. Default: tüm tedarikçiler + tüm zamlar (1 kuruş bile dahil).

**Why this priority**: Mevcut UI yanlış mental model dayatıyor. Doğrudan iş kuralı ile filtreleme operatörün doğru sorulara odaklanmasını sağlıyor.

**Independent Test**: Sayfa ilk açılışında "Son N gün" toggle veya buton yok; "Minimum zam" preset chip görünür ve default "Tümü" işaretli.

**Acceptance Scenarios**:

1. **Given** Sayfa hiçbir filtre seçilmemiş halde açılır, **When** operatör görüntüler, **Then** listede tüm zamlanan ürünler (1 kuruş+) tedarikçi ayırt etmeksizin görünür.
2. **Given** Operatör "Minimum zam %5+" chip'ini seçer, **When** filtre uygulanır, **Then** liste %5 ve üzeri zammı olan ürünlere indirgenir; URL `?min=5` parametresi taşır (sayfa yenilenince filtre korunur).

---

### User Story 3 — Snapshot eksik durumu görünür (Priority: P2)

**Persona**: Operatör — bir ürün için tedarikçi catalog'unda artık fiyat olmayabilir (üretimden kalkmış veya scrape henüz çalışmamış).

**Senaryo**: Ürün geçmişte sipariş edildi ama bugün `price_snapshots` tablosunda hiçbir kaydı yok. Operatör bu ürünü listede **"Bugünkü fiyat bilinmiyor — tedarikçi catalog'unda olmayabilir"** rozeti ile görür.

**Why this priority**: P2 çünkü ana akış için kritik değil; ancak operatörün veriyi yorumlama doğruluğu için önemli (eksik veriyi "zam yok" sanmaktan koru).

**Independent Test**: DB'de sipariş kalemi olan ama price_snapshots'ta kaydı olmayan bir ürün için satır görünür; delta sütununda fiyat yerine "bilinmiyor" işareti ve açıklayıcı rozet bulunur.

**Acceptance Scenarios**:

1. **Given** Ürün X DB'de bir sipariş kaleminde var ama hiç snapshot'ı yok, **When** sayfa açılır, **Then** satır görünür: son alış tarihi + son alış fiyatı + "Bugünkü fiyat bilinmiyor" rozeti.
2. **Given** Min zam %5+ filtresi seçili, **When** sayfa açılır, **Then** "fiyat bilinmiyor" satırları **görünmez** (yüzdesi bilinemediği için filtreye dahil edilemez).

---

### User Story 4 — Stok yaşı + birikimli zam görselleştirmesi (Priority: P3)

**Persona**: Operatör — birikimli zam'ın "hangi tarihlerde geldiğini" merak ediyor (Şubat'ta vs Mayıs'ta vs Eylül'de).

**Senaryo**: Her satırda son alış tarihinden bu yana geçen gün sayısı görünür ("282 gün önce"). Satırın yanındaki "▼ Zam tarihçesi" tıklanınca o ürün için tüm `price_snapshots` zaman çizelgesi açılır.

**Why this priority**: P3 — ana akış için gerekli değil; gelişmiş analiz için bonus. V1 sonrası iterasyona bırakılabilir.

**Independent Test**: Bir satır için tarihçe genişletildiğinde o ürünün tüm snapshot'larının tarih+fiyat dizisi görünür.

**Acceptance Scenarios**:

1. **Given** Bir ürünün 3 snapshot'ı var (Şubat 40 TL, Mayıs 45 TL, Eylül 52 TL), **When** operatör "Zam tarihçesi ▼" tıklar, **Then** üç nokta zaman çizelgesinde görünür.

---

### Edge Cases

- **Aynı ürün hem ürün koduyla hem barkodla** kayıtlı (009 barkod fallback): products tablosu tedarikçi başına `code` unique; aynı ürün ID tek satır.
- **İlk sipariş fiyatı 0 TL** (parse hatası): delta hesaplanamaz → "fiyat bilinmiyor" muamelesi.
- **Snapshot mevcut ama son alıştan eski**: ör. son alış Mart, snapshot Şubat — snapshot **son alıştan sonraki** ise kullanılır; öncekiyse yok sayılır. (Sebep: son alış anındaki fiyat zaten `unit_price_at_order` ile temsil edilir; daha eski snapshot anlamsız.)
- **Aynı ürünün farklı tedarikçilerden alımı**: cross-supplier eşleştirme yok (010 anti-goal); her tedarikçi-ürün çifti ayrı satır.
- **Sipariş kaleminin product_id'si NULL** (henüz catalog scrape eşleştirememiş): listede görünmez (eşleştirme şart).
- **Bugünkü snapshot ile son alış aynı tarihte**: delta varsa gösterilir; yoksa gösterilmez.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistem her sipariş edilmiş ürün için son siparişteki birim fiyatı (KDV hariç net) ve bugünkü tedarikçi fiyatı (KDV hariç net) arasında karşılaştırma yapmalıdır.
- **FR-002**: "Son sipariş" = ürünün herhangi bir tedarikçide kayıt edilmiş en yeni siparişteki kalem. Aynı tedarikçide birden fazla sipariş varsa en yeni `ordered_at` esas alınır.
- **FR-003**: Liste yalnızca `son_alış_fiyatı < bugünkü_fiyat` olan ürünleri içermelidir (zamlar). Fiyat düşüşleri ve eşit fiyatlar V1'de gösterilmez.
- **FR-004**: Sayfa görünür "Son N gün" pencere filtresi içermez. Pencere kavramı tamamen kaldırılır.
- **FR-005**: Sayfada tedarikçi filtresi (4 seçenek + Tümü) ve minimum zam % filtresi (Tümü / %5+ / %10+ / %25+ / %50+) bulunur. Filtreler URL query parametresi olarak korunur (sayfa yenilenince devam eder).
- **FR-006**: Her satırda görünür alanlar: tedarikçi adı, ürün kodu, ürün adı, son alış tarihi, son alış birim fiyatı (KDV hariç), bugünkü birim fiyat (KDV hariç), delta TL, delta %, son alış tarihinden bu yana geçen gün.
- **FR-007**: Bir ürünün `price_snapshots` tablosunda kaydı yoksa satır yine de listede görünür; bugünkü fiyat alanı yerine "Bugünkü fiyat bilinmiyor — tedarikçi catalog'unda olmayabilir" rozeti gösterilir. Minimum zam % filtresi aktifse bu satırlar listede görünmez.
- **FR-008**: Default sıralama: zam yüzdesi azalan (en çok zamlanan üstte). Operatör sıralama seçeneklerinden (zam % / zam TL / stok yaşı / son alış tarihi) tercih edebilir.
- **FR-009**: Her satır genişletilebilir "Zam tarihçesi ▼" linki içerir; tıklandığında o ürün için tüm `price_snapshots` zaman dizisi görüntülenir (User Story 4, P3 — opsiyonel V1 sonrası).
- **FR-010**: Mevcut "düşüşleri göster" (include_drops) toggle kaldırılır.

### Key Entities

- **products**, **order_items**, **supplier_orders**, **price_snapshots**, **suppliers**: Mevcut tablolar değişmez. Sadece yeni sorgu mantığı (RPC veya view) eklenir.
- **PriceComparisonRow** (görüntüleme tipi): `productId`, `supplierSlug`, `supplierName`, `productCode`, `productName`, `brand`, `lastOrderPriceExclVat`, `lastOrderedAt`, `lastOrderNo`, `currentPriceExclVat | null`, `currentPriceCapturedAt | null`, `changePct | null`, `changeAmount | null`, `daysSinceLastOrder`.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Operatör sayfayı açtığında pencere filtresine ihtiyaç duymadan zamlanan ürünlerin tamamını tek bakışta görür (sayfa içeriği snapshot pencere kısıtına bağlı değildir).
- **SC-002**: Bir önceki sipariş tarihinden bu yana zamlanan ürün sayısı operatör tarafından doğrulanabilir — DB'deki tüm tedarikçi-ürün çiftleri için manuel sayım dashboard sayısı ile eşittir.
- **SC-003**: Aynı ürün 1 yıl içinde 3 ayrı zam gördüyse (örn. %5+%8+%12 ardışık), dashboard tek satırda toplam birikimli delta'yı (~%27) gösterir; üç ayrı satır görünmez.
- **SC-004**: Operatör tedarikçi ve minimum zam % filtrelerini değiştirdiğinde sayfa 1 saniye içinde güncellenir (yaklaşık 250+ ürünlük dataset için).
- **SC-005**: Snapshot eksik durumdaki ürünler operatör tarafından "veri eksik" şeklinde anlaşılır; hatalı olarak "zam yok" yorumuna yol açmaz (rozet metinli açıklama).
- **SC-006**: Mevcut dashboard'un diğer sayfaları (sipariş listesi, settings) görsel ve fonksiyonel olarak değişmez (regresyon sıfır).

---

## Assumptions

- "Son sipariş" tanımı sadece **aynı tedarikçi içindeki** siparişlere bakar. Aynı ürün başka tedarikçiden geçmişte alındıysa onunla karşılaştırma yapılmaz (010 anti-goal: cross-supplier eşleştirme).
- `order_items.unit_price_at_order` operatörün siparişte ödediği KDV hariç net birim fiyatıdır (006/010 KDV modeli). `price_snapshots` KDV dahil de tutuyor olsa adapter KDV hariç değeri de yazıyor (009 idempotency fix + barkod fallback kararıyla netleşti).
- `price_snapshots.unit_price_excl_vat` kolonu varsayılır (proje genelinde KDV hariç takip); yoksa `unit_price_with_vat / (1 + vat_rate)` ile hesaplanır.
- Dataset büyüklüğü yaklaşık 250-500 sipariş kalemi × tedarikçi (DB'deki ürün sayısı sırasıyla Enderyapı 489, Yedekler 157, İkizler 122, Levent 15). Sayfa server-side render ile rahatlıkla performans sınırlarında kalır.
- "Stok yaşı" göstergesi sadece bilgilendirme — gerçek stok adedi V1'de yok (Constitution V1 anti-goal).
- Düşüşler V1'de yok; istenirse 013 olarak ayrı feature.

---

## Out of Scope (Anti-Goals)

- ❌ Stok adedi takibi (Constitution V1).
- ❌ Cross-supplier ürün eşleştirme (aynı ürün farklı tedarikçilerden ne kadara → 010 anti-goal).
- ❌ Fiyat düşüşleri / "iyi fırsat" listesi (V1 kapsam dışı; istenirse 013).
- ❌ E-posta/push uyarı (zamlanan ürün uyarısı) — sadece dashboard üzerinde görünür (006 anti-goal).
- ❌ Birim fiyat dışında stok değerleme / kar marjı hesaplamaları.
- ❌ Geçmiş fiyat tahmini / regresyon (ML, "önümüzdeki ay kaç zam"); yalnız gözlenmiş veri.
- ❌ Geriye dönük yeni sipariş kalemleri üretmek; mevcut `order_items` / `supplier_orders` verisiyle çalışılır.
