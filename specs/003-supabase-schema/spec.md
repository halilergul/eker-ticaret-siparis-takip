# Feature Specification: Supabase Schema — Tedarikçi Sipariş & Fiyat Takibi

**Feature Branch**: `003-supabase-schema`

**Created**: 2026-05-16

**Status**: Draft

**Input**: User description: "Feature 003 — PoC bulgularına göre Supabase schema tasarımı: suppliers + supplier_orders + order_items + products + price_snapshots. Tek kullanıcılı, RLS-korumalı, çoklu tedarikçiye hazır iki seviyeli yapı (sipariş başlığı → ürün satırı) + ayrı katalog/fiyat snapshot tablosu."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Scraper sonuçlarını veritabanına kalıcı yazma (Priority: P1)

Kullanıcı (Halil) scraper'ı bir tedarikçi sitesi için (örn. Enderyapi) çalıştırdığında elde edilen siparişler ve içindeki ürün satırları veritabanına idempotent şekilde yazılmalı: aynı scraper koşumu iki kez çalıştırıldığında veri çoğalmamalı, eksik satırlar varsa eklenmeli, mevcut satırlar değişmemeli.

**Why this priority**: Schema'nın varoluş nedeni budur — scraper'dan gelen veriyi tutmadan ne fiyat farkı takibi ne de dashboard mümkün. Bu story olmadan 004 (gerçek scraper) yazılamaz; ürün etrafındaki tüm sonraki feature'lar bu yapıya bağımlı.

**Independent Test**: Tek kullanıcı oturum açar, manuel SQL veya küçük seed script'i ile bir sipariş + 3 ürün satırı insert eder, aynı insert'i tekrar çalıştırır → satır sayısı değişmez. Sonra aynı sipariş_no ama 1 yeni ürün satırı içeren payload gönderilir → sadece o satır eklenir.

**Acceptance Scenarios**:

1. **Given** boş veritabanı, **When** "enderyapi" tedarikçisi için bir sipariş (sipariş_no `ESP018-12345`, 3 ürün satırı, toplam tutar 1.250 ₺) insert edilir, **Then** `suppliers` 1 kayıt, `supplier_orders` 1 kayıt, `order_items` 3 kayıt, `products` 3 kayıt içerir.
2. **Given** önceki senaryonun sonucu, **When** aynı sipariş + aynı ürün satırları tekrar insert edilir, **Then** hiçbir tabloda yeni satır oluşmaz (idempotent).
3. **Given** önceki senaryonun sonucu, **When** aynı siparişe yeni 1 ürün satırı eklenmiş olarak gelir, **Then** `order_items` 4 kayda çıkar, diğer tablolar sabit kalır.

---

### User Story 2 — Ürün fiyatlarındaki değişimi otomatik kaydet (Priority: P2)

Scraper bir ürünün güncel birim fiyatını (katalog sayfasından) okuduğunda, eğer ürünün veritabanındaki son fiyatı farklı ise yeni bir fiyat snapshot'ı yazılmalı. Aynı fiyat ise yeni snapshot yazılmaz (gürültü olmaz).

**Why this priority**: Bu projenin temel iş değeri — "aldığım üründen sonra fiyat arttı mı?" sorusunun cevabı snapshot tarihçesinde yatar. P2 çünkü P1 olmadan ürün kayıtları olmaz; ama P1 tek başına da kullanılabilir (en az sipariş geçmişi görüntülenebilir).

**Independent Test**: Bir ürün için ilk gözlemde fiyat 100 ₺ yazılır → `price_snapshots` 1 satır. Aynı fiyatla tekrar yazılır → `price_snapshots` 1 satır kalır. Farklı fiyatla (110 ₺) yazılır → `price_snapshots` 2 satıra çıkar, `products.current_unit_price` 110 olur, `products.last_seen_at` güncellenir.

**Acceptance Scenarios**:

1. **Given** "Vida M8 paslanmaz" ürünü yok, **When** ilk gözlem 100 ₺ kaydedilir, **Then** `products` 1 yeni kayıt (`current_unit_price=100`), `price_snapshots` 1 yeni kayıt (`unit_price=100`).
2. **Given** ürün mevcut ve `current_unit_price=100`, **When** aynı 100 ₺ tekrar gözlemlenir, **Then** `price_snapshots` yeni satır eklenmez; `products.last_seen_at` güncellenebilir ama fiyat değişmez.
3. **Given** ürün mevcut ve `current_unit_price=100`, **When** 110 ₺ gözlemlenir, **Then** `price_snapshots` 1 yeni satır (110 ₺), `products.current_unit_price` 110 olur.

---

### User Story 3 — Çoklu tedarikçi desteği (Priority: P3)

Sistem birden fazla B2B tedarikçi sitesini ayrı kayıtlar olarak tutabilmeli. Aynı ürün kodu iki farklı tedarikçide yer alabilir; bu durumda iki ayrı `products` kaydı olur (her tedarikçi kendi katalogu).

**Why this priority**: V1'in ilk gerçek scraper'ı (004) yalnızca Enderyapi için; ama schema baştan multi-tenant düşünmeli, sonradan tablo restructure etmek zor olur. P3 çünkü ilk MVP tek tedarikçiyle bile çalışır.

**Independent Test**: İki suppliers kaydı (`enderyapi`, `placeholder-supplier-2`) seed edilir. Aynı ürün kodu (`VDA-M8`) her iki tedarikçi için ayrı insert edilir → `products` 2 kayıt, `(supplier_id, code)` unique constraint çakışmaz.

**Acceptance Scenarios**:

1. **Given** sadece "enderyapi" tedarikçisi mevcut, **When** ikinci tedarikçi (`acme-b2b`, `base_url=https://b2b.acme.example`) eklenir, **Then** `suppliers` 2 kayıt; ilk tedarikçinin verileri etkilenmez.
2. **Given** iki tedarikçi mevcut, **When** aynı `code='VDA-M8'` her iki tedarikçi için insert edilir, **Then** iki ayrı `products` satırı oluşur; tekrar deneme `(supplier_id, code)` unique ihlali ile reddedilir (her tedarikçi içinde unique).

---

### Edge Cases

- **Sipariş tutarı sıfır veya negatif**: Veri kalitesi anomalisi. Schema seviyesinde CHECK constraint ile `total_amount >= 0` zorlanır; scraper bozuk veri gönderirse hata alır (sessiz kayıt yerine).
- **Aynı sipariş, farklı tarih**: `supplier_orders (supplier_id, order_no)` unique. Tarih farkı önemsiz; ilk gözlemdeki `ordered_at` saklanır, sonraki upsert'lerde değişmez.
- **Ürün adı zamanla değişir**: Tedarikçi katalog adını güncelleyebilir. Schema en son gözlemlenen adı saklar (`products.name` upsert'te override edilir); `order_items.product_name` ise sipariş zamanındaki adı dondurur (history).
- **Fiyat NULL**: Scraper bazen güncel fiyatı parse edemez (PoC'de yaşandı). Bu durumda `price_snapshots` yazılmaz; `products.current_unit_price` NULL kalır veya eski değerinde durur. Asla 0 yazılmaz.
- **Tek kullanıcı**: Auth zaten 001'de kuruldu. RLS politikaları her tabloda `auth.uid() IS NOT NULL` ile aktif; `service_role` bypass'lar.
- **Para birimi**: Tüm fiyatlar tek currency (TRY) varsayılır; schema'da `currency` kolonu açık tutulur ama enforcement TRY ile sınırlı. Multi-currency 005+ scope.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistem tedarikçi siteleri kayıt altına alabilmeli — her tedarikçinin tekil bir `slug` (örn. "enderyapi"), insan-okunabilir adı ve `base_url`'ü olmalı.
- **FR-002**: Sistem siparişleri sipariş başlığı seviyesinde saklamalı — her sipariş bir tedarikçiye ait olmalı, tedarikçi içinde sipariş numarası tekil olmalı (`(supplier_id, order_no)` unique).
- **FR-003**: Sistem sipariş başlığında en az şu alanları tutmalı: sipariş numarası, durum metni (Türkçe; "Onaylandı", "Onay bekliyor" vb.), sipariş tarihi, toplam tutar, oluşturulma ve son güncelleme zaman damgaları.
- **FR-004**: Sistem her sipariş içindeki ürün satırlarını ayrı saklamalı — her satır: ürün kodu, ürün adı (sipariş anındaki kopya), adet, alış birim fiyatı.
- **FR-005**: Sistem ürün katalog tablosu tutmalı — her ürün bir tedarikçiye ait olmalı, tedarikçi içinde ürün kodu tekil olmalı (`(supplier_id, code)` unique), güncel birim fiyat ve son gözlem zamanı saklanmalı.
- **FR-006**: Sistem her ürünün fiyat değişim tarihçesini ayrı `price_snapshots` tablosunda saklamalı — her snapshot bir ürüne, bir gözlem zamanına ve bir birim fiyata bağlı olmalı.
- **FR-007**: Yeni bir fiyat snapshot'ı yalnızca gözlemlenen fiyat ürünün mevcut `current_unit_price` değerinden farklıysa oluşturulmalı; aynı fiyat tekrar yazılırsa snapshot eklenmemeli.
- **FR-008**: `order_items` ve `supplier_orders` arasında parent-child ilişki olmalı; sipariş silinirse satırları da silinmeli (CASCADE).
- **FR-009**: `products`, `supplier_orders` ve `order_items` arasında doğrudan FK olmamalı; bağlantı ürün kodu üzerinden yumuşak (denormalize) tutulmalı — aynı kod ama henüz katalogda yer almayan ürün siparişte görünebilmeli.
- **FR-010**: Tüm tablolarda RLS aktif olmalı; politika "authenticated user görür/yazar" şeklinde basit tutulmalı (tek kullanıcı senaryosu); `service_role` bypass yapabilmeli (scraper için).
- **FR-011**: Tüm para alanları yüksek hassasiyetli ondalık sayı (NUMERIC, en az 2 ondalık) olarak saklanmalı; float kullanılmamalı (yuvarlama hatası ile fiyat farkı yanlış hesaplanır).
- **FR-012**: Tüm zaman damgaları `timestamptz` olmalı, UTC saklanmalı; UI okuma sırasında TR locale'e çevrilir.
- **FR-013**: Her tabloda `id` UUID (DEFAULT `gen_random_uuid()`), `created_at` ve `updated_at` `timestamptz DEFAULT now()` kolonları olmalı; `updated_at` trigger ile otomatik güncellenmeli.
- **FR-014**: Performans için sık sorgulanan kolonlarda index olmalı: `supplier_orders.supplier_id`, `supplier_orders.ordered_at`, `order_items.order_id`, `products.supplier_id`, `price_snapshots.product_id`, `price_snapshots.captured_at`.
- **FR-015**: Seed data olarak bir adet "enderyapi" supplier kaydı (`slug=enderyapi`, `name=Enderyapi B2B`, `base_url=https://b2b.enderyapi.com.tr`) migration ile eklenmeli.
- **FR-016**: TypeScript type'ları Supabase otomatik üretiminden çıkarılmalı (`mcp__supabase__generate_typescript_types` veya CLI); `lib/supabase/types.ts` (veya benzer yol) altında client/server kodunun tüketmesi için hazır olmalı.

### Key Entities

- **Supplier**: B2B tedarikçi site kaydı. Alanlar: tekil slug (`enderyapi` vb.), insan-okunabilir ad, base URL, oluşturulma zamanı. İlişki: 1-N → `SupplierOrder`, 1-N → `Product`.
- **SupplierOrder**: Tek bir siparişin başlık bilgisi. Alanlar: tedarikçi referansı, sipariş numarası (tedarikçi içinde unique), durum metni, sipariş tarihi, toplam tutar, currency (TRY default). İlişki: N-1 → `Supplier`, 1-N → `OrderItem`.
- **OrderItem**: Bir sipariş içindeki tek bir ürün satırı (kalem). Alanlar: sipariş referansı, ürün kodu, sipariş anındaki ürün adı (snapshot), adet, alış birim fiyatı (sipariş anında). İlişki: N-1 → `SupplierOrder`. `Product` ile FK yok; kod üzerinden yumuşak bağlantı.
- **Product**: Tedarikçi katalogundaki bir ürün kaydı. Alanlar: tedarikçi referansı, ürün kodu (tedarikçi içinde unique), ürün adı (en son gözlem), güncel birim fiyat (nullable), son gözlem zamanı (nullable), currency. İlişki: N-1 → `Supplier`, 1-N → `PriceSnapshot`.
- **PriceSnapshot**: Bir ürünün belirli bir zamandaki gözlem fiyatı. Alanlar: ürün referansı, gözlem zamanı, birim fiyat, currency. Yalnızca fiyat değiştiğinde yeni kayıt yazılır. İlişki: N-1 → `Product`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Veritabanı denetim aracı (Supabase advisors / lint) ile çalıştırılan kontrolde RLS-disabled, FK-missing, no-index-on-FK gibi kritik (error/warn) uyarı çıkmaz; bilgilendirme (info) uyarıları kabul edilebilir.
- **SC-002**: PoC senaryosundaki 20 sipariş + ~60 ürün satırı (sentetik veya gerçek) idempotent bir SQL fixture/seed üzerinden art arda 3 kez çalıştırıldığında satır sayıları sabit kalır (tabloda satır sayısı her tekrarda değişmez).
- **SC-003**: Belirli bir ürün için fiyat 5 farklı zamanda (3 farklı değer ile) yazıldığında `price_snapshots` tablosunda yalnızca 3 satır oluşur ve `products.current_unit_price` son değeri yansıtır.
- **SC-004**: Anonim (oturum açmamış) bir client tüm tabloları sorguladığında satır göremez (RLS); aynı tablolara `service_role` anahtarı ile yazma başarılı olur.
- **SC-005**: TypeScript type türetme komutu hatasız çalışır ve frontend kodu `Database` tipini import edip tabloları autocomplete ile görebilir; type'lar mevcut `lib/supabase` istemcileri ile uyumlu (build hatası vermez).
- **SC-006**: Bir geliştirici (kendi makinemde) bu feature'ın tüm migration dosyalarını boş bir Supabase projesine uygulayıp seed'i çalıştırdıktan sonra tüm yukarıdaki kriterleri 30 dakikadan kısa sürede manuel olarak doğrulayabilir.

## Assumptions

- Tek kullanıcı projesi: Auth 001'de kuruldu, tek "owner" rolü var; per-row sahiplik (`user_id` FK) tablolarda gerekmiyor — RLS basit "authenticated görür/yazar" olarak yeterli.
- Tüm fiyatlar TRY: Para birimi kolonu açık tutulur ama tek-currency varsayımı yapılır; multi-currency 005+ scope.
- Scraper bu schema'ya doğrudan yazacak (004): Schema scraper'dan önce hazır olmalı; bu feature scraper kodu yazmaz, yalnızca yapı + seed sağlar.
- Bu feature UI eklemiyor: Dashboard tabloları görüntüleme (006+ feature) ayrı yapılır; bu feature sadece data layer.
- Sipariş satırı ↔ ürün bağlantısı yumuşak (kod ile): Strong FK kullanmak, henüz katalog ziyaret etmeden sipariş okumayı engelleyebilir. PoC'de gözlemlendi: önce sipariş listesi okunuyor, katalog ürün detayları sonra ziyaret ediliyor.
- `products` tablosundaki `name`, `order_items.product_name`'in aksine, en son gözlemde override edilir. Geçmiş sipariş satırları kendi adlarını korur.
- Migration'lar Supabase MCP üzerinden `apply_migration` ile uygulanır; local CLI kurulu olmadığı için remote-first çalışılır (Constitution'da kabul edilmiş yaklaşım, G14 ileri feature'da düzeltilir).
- `gen_random_uuid()` için `pgcrypto` extension aktif olmalı; aktif değilse migration'ın ilk adımı `CREATE EXTENSION IF NOT EXISTS pgcrypto`.
- TypeScript type türetme manuel komut olarak kalır; CI'ye otomasyon 005+ feature.
