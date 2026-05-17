# Feature Specification: Sipariş Listesi Dashboard

**Feature Branch**: `005-orders-dashboard`

**Created**: 2026-05-16

**Status**: Draft

**Input**: User description: "Kullanıcı (Halil) 001'de açılan boş dashboard ekranına 004 scraper'ın DB'ye yazdığı siparişleri liste/tablo halinde görmek istiyor. En yeni sipariş başta sıralı; tedarikçi (supplier) ve durum (status) filtreleri; sipariş satırına tıklayınca o siparişin ürün satırları görünür. Tek kullanıcı; yetkilendirme zaten 001'den hazır."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Sipariş listesini gör (Priority: P1) 🎯 MVP

Kullanıcı dashboard'a girdiğinde tedarikçi sipariş geçmişini son tarihten eskiye doğru sıralı bir tablo olarak görür: her satırda sipariş numarası, tedarikçi adı, durum, tarih, toplam tutar. Liste mevcut tüm siparişleri tek seferde gösterir (V1 için pagination zorunlu değil — beklenen veri hacmi <1000 satır).

**Why this priority**: Bu projenin tüm yatırımının ilk görünür çıktısı — kullanıcı 004 scraper'ı çalıştırdı, veri DB'de duruyor, hâlâ erişemiyor. Dashboard'da liste olmadan sistem "vardır" ama "kullanılmıyor".

**Independent Test**: Kullanıcı login olur, `/dashboard`'a gider, sipariş tablosunu görür. 004 scraper'ı koşturduktan sonra DB'de 5 sipariş varsa tabloda 5 satır görünür. Yeni scrape sonrası refresh ile yeni siparişler tabloda belirir.

**Acceptance Scenarios**:

1. **Given** DB'de 5 sipariş kayıtlı (004'ün ilk koşumundan), **When** kullanıcı `/dashboard`'a gider, **Then** ekranda en yeni 5 sipariş ordered_at DESC sırada listelenir; her satırda sipariş_no, tedarikçi adı, durum, tarih (DD.MM.YYYY veya "X gün önce"), toplam tutar (TR locale, ₺) görünür.
2. **Given** DB hiç sipariş yok, **When** kullanıcı `/dashboard`'a gider, **Then** boş durum mesajı görür: "Henüz sipariş yok. Scraper'ı çalıştırarak ilk verileri alabilirsin." + komut hint (`npm run scrape -- --supplier enderyapi`).
3. **Given** scraper 50 sipariş yazdı, **When** kullanıcı sayfayı görür, **Then** 50 satır görünür, en yeni en üstte; ekran kaydırılabilir (page-level scroll); ilk render <2 saniye.

---

### User Story 2 — Filtre: tedarikçi + durum (Priority: P2)

Kullanıcı liste içinde filtre kullanarak yalnızca belirli bir tedarikçinin veya belirli durumdaki siparişleri görür ("Sadece Enderyapi", "Sadece onaylanmış", veya kombinasyon).

**Why this priority**: V1'de tek tedarikçi (Enderyapi) ama schema multi-supplier; ileride 2-3 tedarikçi eklenince filtre olmadan liste karmaşıklaşır. Durum filtresi "ben sadece onay bekleyenleri göreyim" senaryosu için. P2 çünkü P1 olmadan list zaten yok, ama liste filtreyi V1 MVP'de çok kullanışlı yapmıyor (tek supplier + nadir farklı status).

**Independent Test**: 2 supplier seed edilir (sentetik). Kullanıcı filter dropdown'undan "Enderyapi" seçer → sadece Enderyapi siparişleri görünür. "Onaylandı" seçer → her tedarikçide sadece onaylı siparişler görünür. Filter kombinasyonu da çalışır.

**Acceptance Scenarios**:

1. **Given** DB'de 2 tedarikçi (enderyapi: 5 sipariş, acme-test: 3 sipariş), **When** kullanıcı filter "Tedarikçi: Enderyapi" seçer, **Then** tabloda sadece 5 enderyapi siparişi görünür.
2. **Given** önceki, **When** kullanıcı filter ek olarak "Durum: Onaylandı" seçer, **Then** sadece status='Onaylandı' olan enderyapi siparişleri görünür.
3. **Given** filtre uygulandı, **When** kullanıcı "Filtreleri Temizle" tıklar, **Then** tüm siparişler geri görünür.
4. **Given** filtreli URL (`?supplier=enderyapi&status=Onaylandı`), **When** kullanıcı bu URL'i bookmark'tan açar, **Then** filtre seçimi geri yüklenir (URL state korunur).

---

### User Story 3 — Sipariş detay (Priority: P3)

Kullanıcı bir sipariş satırına tıklar, o siparişin içindeki ürün satırları (kod, ad, adet, alış birim fiyatı, satır toplamı) görünür. V1'de modal/expander veya ayrı bir sayfa (`/dashboard/orders/<id>`) — basit görünüm.

**Why this priority**: "Bu siparişe ne aldım?" sorusunun cevabı. Foundation olarak gerekli ama liste tek başına da "sipariş geçmişim X TL toplam" cevabı verir. P3 çünkü P1 + P2 olmadan detay sayfasının kaynağı yok; ayrıca fiyat fark dashboard'u (007 feature) bunu temel alacak.

**Independent Test**: Kullanıcı bir sipariş satırına tıklar (örn. ESP0192194). Bu siparişin order_items'i listelenir: ürün kodu, ad, adet, birim fiyat, satır toplamı (adet × birim). Toplam satır altında "Toplam: X ₺" görünür ve `supplier_orders.total_amount` ile eşleşir.

**Acceptance Scenarios**:

1. **Given** DB'de sipariş ESP0192194 + 1 satır (vida kodu, 50 adet, 5.00 ₺), **When** kullanıcı satıra tıklar, **Then** detay görünümü açılır: ürün kodu, ad, "50 adet × 5,00 ₺ = 250,00 ₺" formatında satır + toplam.
2. **Given** sipariş 5 farklı ürün içerir, **When** detay görünümü açılır, **Then** 5 satır listelenir; ürün adları TR karakterleriyle doğru render olur ("Vida M8 paslanmaz" gibi).
3. **Given** kullanıcı detay açıkken liste sayfasına döner, **When** geri butonuyla, **Then** filtreler kaybolmaz (URL state korunur).
4. **Given** kullanıcı geçersiz sipariş ID URL'i açar (`/dashboard/orders/<bilinmeyen-uuid>`), **When** sayfa yüklenir, **Then** 404 veya "Sipariş bulunamadı" mesajı + dashboard'a dön linki.

---

### Edge Cases

- **Boş tablo**: Hiç sipariş yok — empty state + scraper hint (US1 senaryo 2).
- **Tek satır siparişler**: 004'ün şu anki bilinen sınırlaması (her sipariş için 1 ürün satırı parse ediyor); detay görünümü bunu olduğu gibi gösterir — yanıltıcı değil, gerçek.
- **Çok uzun ürün adları**: Tablo hücresinde truncate (ellipsis); detayda full görünür.
- **TR karakter sorgu/filter**: Status "Onaylandı" filter'ı `İ/I` collation sorununa düşmemeli (Postgres'in default `en_US.UTF-8` `Onaylandı` ile `ONAYLANDI` ayrı tutar — biz exact match kullanırız).
- **Status değeri yeni gözlemlendi**: Dropdown filter sadece DB'deki var olan status'lardan oluşur (statik enum değil); yeni status `İptal` gözlemlenirse dropdown'a otomatik eklenir.
- **Sipariş silindi sonra yeniden geldi**: Soft delete YOK (Constitution); silinmiş sipariş için ayrı senaryo yok.
- **Tarih NULL**: Schema NOT NULL; veri kalitesi sorunu — fallback olarak created_at göster.
- **Sipariş tutarı = 0**: Geçerli edge case (004'ün defansif "tutar bulamazsa 0" davranışı). Listede 0 ₺ olarak görünür; renk veya badge ile (örn. ⚠) işaretlenebilir ama V1'de basit metin.
- **Concurrent scrape + view**: Kullanıcı dashboard'daki tabloyu açıkken scraper yeni satır eklerse, tablo otomatik refresh OLMAZ; kullanıcı manual refresh yapar. Real-time subscription V2 scope.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistem `/dashboard` route'una login olmuş kullanıcı geldiğinde tüm `supplier_orders` kayıtlarını ordered_at DESC sıralı bir tablo olarak göstermeli.
- **FR-002**: Tablo satırı şu kolonları içermeli: sipariş_no, tedarikçi adı (suppliers.name join), durum, tarih, toplam tutar.
- **FR-003**: Tarih TR locale formatında görünmeli (`16.05.2026` veya "X gün önce" relative format); tutar TR locale + ₺ simbolü (örn. `1.234,56 ₺`).
- **FR-004**: Boş tablo durumunda empty state mesajı + scraper komutu hint görünmeli.
- **FR-005**: Liste sayfası Server Component olarak render edilmeli; ilk paint <2 saniye (50 sipariş için).
- **FR-006**: Pagination V1'de YOK; tüm satırlar tek sayfada (beklenen <1000 satır). Veri hacmi büyürse 007+ feature pagination ekler.
- **FR-007**: Sistem **tedarikçi filtresi** sunmalı — dropdown veya select; "Tüm tedarikçiler" + her supplier slug seçeneği.
- **FR-008**: Sistem **durum filtresi** sunmalı — dropdown; "Tüm durumlar" + DB'de görülmüş distinct status'lar dinamik olarak.
- **FR-009**: Filtre seçimi URL search params'ta saklanmalı (`?supplier=enderyapi&status=Onaylandı`); refresh / bookmark sonrası restore edilmeli.
- **FR-010**: Sistem "Filtreleri Temizle" butonu sunmalı; URL'i `/dashboard`'a sıfırlar.
- **FR-011**: Kullanıcı tablo satırına tıklayınca **sipariş detayı** açılır — V1'de **modal/expander** veya **ayrı sayfa** (`/dashboard/orders/<id>`); seçim teknik karar.
- **FR-012**: Sipariş detayı şu bilgileri göstermeli: sipariş_no + tedarikçi + tarih + durum + içindeki tüm `order_items` (kod, ad, adet, birim fiyat, satır toplamı = adet × birim) + toplam (matches `total_amount`).
- **FR-013**: Bilinmeyen sipariş ID için detay sayfası `404 Bulunamadı` mesajı + dashboard'a dön linki göstermeli.
- **FR-014**: Tüm DB sorguları RLS-respecting Supabase server client (`@/lib/supabase/server.ts`) ile yapılmalı; service_role kullanılmaz (Constitution: client tarafına sızmaz).
- **FR-015**: Auth: middleware (`lib/supabase/middleware.ts`) 001'den hazır; `/dashboard` ve `/dashboard/orders/*` zaten korumalı.
- **FR-016**: Sistem TR diline sahip tüm metinleri (label, button, status, empty state) Türkçe göstermeli (i18n library YOK, hardcoded TR).
- **FR-017**: Tablo responsive olmalı — mobil değil ama 1024px+ ekranda okunabilir, 1280px+'ta optimal (Constitution: desktop-first, mobil V1 anti-goal).

### Key Entities

- **OrderTableRow** (UI projection): `supplier_orders` + `suppliers.name` join. Alanlar: id, order_no, supplier_name, supplier_slug, status, ordered_at, total_amount, currency. Read-only.
- **OrderDetail** (UI projection): OrderTableRow + array of `order_items` (product_code, product_name, quantity, unit_price_at_order, line_total = qty × unit). Hesaplanmış toplam DB ile karşılaştırılır.
- **FilterState**: { supplierSlug?: string; status?: string }. URL search params'tan deserialize edilir.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Kullanıcı login olduktan sonra 2 click içinde sipariş listesini görür (login → dashboard).
- **SC-002**: 50 sipariş için ilk render (FCP) 2 saniyenin altında; 500 sipariş için 4 saniyenin altında.
- **SC-003**: Filter dropdown'undan seçim → tablo güncellemesi 1 saniyenin altında (server roundtrip).
- **SC-004**: TR karakter desteği %100 — tüm `İ, ı, ş, ğ, ç, ö, ü` karakterler doğru render olur (manuel test).
- **SC-005**: Boş tablo durumunda kullanıcı sonraki adımı (scraper komutu) ekrandan görür ve uygulayabilir; "ne yapacağım?" sorusu kalmaz.
- **SC-006**: Anonim (oturum açmamış) kullanıcı `/dashboard`'a giderse login sayfasına yönlendirilir (001 middleware davranışı korunur).
- **SC-007**: Sipariş detayında hesaplanan toplam (Σ line_total) `supplier_orders.total_amount`'tan farklıysa UI uyarı badge'i gösterir (data quality red flag); fark 1 kuruş altıysa eşit kabul.
- **SC-008**: Tüm 5 user-facing string Türkçedir; hiçbir English fallback metni görünmez.

## Assumptions

- **Mevcut auth zaten çalışıyor**: 001'de kurulan middleware + login form değişmez; bu feature sadece `/dashboard`'un içeriğini doldurur.
- **Mevcut layout korunur**: `app/(app)/layout.tsx` (top bar, çıkış butonu) 001'den geliyor; içerik alanına sipariş tablosu eklenir.
- **Read-only**: Bu feature hiçbir veriyi değiştirmez (no create/update/delete); sadece sorgu + görünüm.
- **Server Components default**: Tablo + filter Server Component; URL state için Next.js searchParams. İnteraktif click'ler (örn. dropdown change) Client Component island.
- **TR locale**: `Intl.DateTimeFormat('tr-TR')` + `Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' })` ile basit; library YOK.
- **Sipariş detayı için karar tasarım aşamasında (plan.md)**: modal vs ayrı sayfa — Server Component dostu olan ayrı sayfa (`/dashboard/orders/[id]`) muhtemelen daha pragmatik; plan'da netleştirilir.
- **Pagination YOK**: Veri hacmi bir yıl içinde <1000 satır beklenir (Constitution: tek kullanıcı, günde 1 scrape, 4-5 yeni sipariş ortalama).
- **Real-time subscription YOK**: Supabase realtime kullanılmaz; kullanıcı manual refresh yapar.
- **Mobil responsive YOK**: Constitution: V1 anti-goal. Desktop-first; 1024px+ minimum.
- **Auth.uid() varsa görür**: RLS politikası 003'te kuruldu; authenticated user tüm satırları görür (single-user senaryo).
- **Component library**: shadcn/ui veya benzeri component library YOK V1; basit Tailwind ile yetinilir. Eklenecekse plan'da karar.
- **004'ün veri kalitesi sınırlaması**: getOrderDetail her sipariş için şu an 1 satır parse ediyor; UI bunu olduğu gibi gösterir. T022 ileride düzeltince UI otomatik gerçek satırları gösterir (no UI change needed).
