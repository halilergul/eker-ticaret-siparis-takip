# Feature Specification: Yedekler İnşaat tedarikçi eklemesi (4. B2B kaynağı)

**Feature Branch**: `010-yedekler-supplier`

**Created**: 2026-06-04

**Status**: Draft

**Input**: User description: "Yeni tedarikçi: Yedekler İnşaat (bayi.yedekler.com.tr). 3-alanlı login (müşteri kodu + kullanıcı kodu + parola). Sipariş + catalog scrape, 008/009 pattern'i. 4. tedarikçi olarak mevcut dashboard'lara entegre."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Yedekler siparişleri /dashboard'da görünür (Priority: P1)

Sistem yöneticisi (tek kullanıcı: nalbur işletmesi sahibi) Yedekler İnşaat'tan sipariş veriyor. Şu an Enderyapı + İkizler + Levent siparişlerini /dashboard'da tek yerden görüyor; Yedekler de aynı listede görünmeli, tedarikçi filtresinde "Yedekler İnşaat" seçeneği seçilebilir olmalı, sipariş detayı diğerleriyle aynı şekilde açılmalı.

**Why this priority**: Asıl iş değeri burada. Şu anda Yedekler siparişleri için ayrı B2B paneline tek tek bakmak gerekiyor — diğer 3 tedarikçi tek dashboard'da konsolide. P1, bu konsolidasyonun Yedekler kanadını tamamlar ve sistemin temel vaadini (multi-supplier sipariş takibi) eksiksiz hale getirir. MVP slice.

**Independent Test**: Lokal makine + Yedekler kimlik bilgileri ile manuel scrape tetiklendiğinde DB'de Yedekler için en az 1 sipariş + ürün satırları oluşmalı; sonra /dashboard açıldığında Yedekler siparişi listede görünmeli, tedarikçi filtresinde seçilebilir olmalı, detay sayfası ürünleri (kod, ad, qty, birim fiyat) göstermeli. Catalog scrape veya production otomasyon gerekmez — sadece sipariş akışı.

**Acceptance Scenarios**:

1. **Given** Yedekler henüz sistemde yok, **When** manuel scrape Yedekler için tetiklenir, **Then** DB'de Yedekler supplier satırı, en az bir order ve order_items satırı oluşur ve /dashboard'da Yedekler siparişi görüntülenir
2. **Given** /dashboard tedarikçi filtresi açık, **When** "Yedekler İnşaat" seçilir, **Then** sadece Yedekler siparişleri listelenir
3. **Given** Yedekler siparişi listede görünür, **When** sipariş üzerine tıklanır, **Then** sipariş detay sayfası ürün kodları, ürün adları, adet ve birim fiyat (KDV hariç) ile açılır
4. **Given** ilk scrape tamamlandı, **When** ikinci kez aynı scrape tetiklenir, **Then** yeni satır eklenmez (idempotent), mevcut sipariş güncel kalır
5. **Given** scrape login başarısız olur (yanlış kimlik bilgileri), **When** scrape çalışır, **Then** hata logu üretilir, mevcut diğer tedarikçi verileri etkilenmez, kullanıcıya açıklayıcı durum gösterilir

---

### User Story 2 - Yedekler fiyat değişiklikleri /dashboard/zamlanan-urunler'da görünür (Priority: P2)

Sistem yöneticisi tedarikçilerin liste fiyatlarındaki/iskontosundaki değişimi takip ediyor. Şu an 3 tedarikçinin catalog snapshot'ları üzerinden zamlanan ürünler dashboard'unda fiyat hareketleri görünüyor. Yedekler için de catalog scrape yapılarak ürünlerin KDV hariç net özel fiyatları snapshot olarak saklanmalı, fiyat değiştiğinde zamlanan ürünler listesinde Yedekler ürünleri de görünmeli.

**Why this priority**: P1 tamamlandığında temel vaat (sipariş takibi) çalışıyor. Catalog ek bir değer (fiyat artışı erken uyarı) ama olmadan da sistem işe yarıyor. 009'da Enderyapı dışı tedarikçiler için zaten ertelenmiş ve sonradan eklenmişti — Yedekler'de de aynı sıra mantıklı. Sipariş scrape sağlamlaşmadan catalog'a girilirse iki cephede aynı anda DOM keşif riski artar.

**Independent Test**: Lokal makinede catalog scrape tetiklendiğinde DB'de product_price_snapshots tablosunda Yedekler için en az 1 satır oluşmalı. Aynı scrape tekrar çalıştırıldığında snapshot artmamalı (idempotent — aynı tarihte aynı fiyat). Fiyatı değişmiş bir ürün olduğunda /dashboard/zamlanan-urunler tedarikçi filtresi "Yedekler İnşaat"ı göstermeli ve seçildiğinde o ürün listede görünmeli.

**Acceptance Scenarios**:

1. **Given** Yedekler catalog ilk kez taranır, **When** scrape tamamlanır, **Then** her ürün için product_price_snapshots tablosuna bir satır eklenir (ürün kodu, KDV hariç net özel fiyat, supplier_id=yedekler)
2. **Given** catalog daha önce tarandı, **When** aynı gün ikinci tarama yapılır, **Then** mevcut snapshot satırları korunur, duplicate eklenmez (idempotent)
3. **Given** bir ürünün fiyatı değişti, **When** sonraki catalog taraması çalışır, **Then** /dashboard/zamlanan-urunler'da Yedekler filtresi seçildiğinde o ürün eski → yeni fiyat farkıyla listelenir
4. **Given** catalog scrape DOM bozulması ile başarısız olur, **When** orchestrator çalışır, **Then** sipariş scrape phase'i etkilenmez ve başarılı şekilde tamamlanır
5. **Given** bir ürünün KDV oranı sayfadan okunamadı, **When** snapshot kaydedilir, **Then** sistem %20 default KDV varsayar ve net fiyatı bu varsayımla hesaplar/saklar

---

### User Story 3 - Yedekler scrape'i otomatik çalışır + settings'ten tetiklenir (Priority: P3)

Sistem yöneticisi her sabah dashboard'a girip "Şimdi tetikle" tuşuna basmak istemiyor — sistemin günde birkaç kez Yedekler verisini otomatik çekmesini bekliyor. Aynı zamanda manuel kontrol için settings sayfasında Yedekler için bir tetikleme kartı olmalı, yeni Vercel deploy gerektirmeden GitHub'da scheduled workflow Yedekler için de çalışmalı.

**Why this priority**: P1 + P2 lokal makinada manuel akışla çalışır; productiona almak (otomatik cron + UI'dan tetikleme) ayrı bir cilalama adımı. Veri akışı çalışıp kullanıcı confidence kazandıktan sonra otomatize etmek doğru sıralama (DOM keşif riski yüzünden ilk koşumların gözlemli olması faydalı). Diğer 3 tedarikçinin otomasyonu zaten çalıştığı için sistem omurgası hazır.

**Independent Test**: Settings sayfası açıldığında Yedekler için TriggerCard görünmeli; "Şimdi tetikle" basıldığında scrape çalışıp tamamlanmalı (UI "Çalışıyor"dan "Başarılı"ya dönmeli, son koşum tarihi güncellenmeli). GitHub Actions workflow_dispatch tetiklemesinde supplier dropdown'unda "yedekler" seçeneği bulunmalı. Scheduled cron tetiklemesinde Yedekler'in de koşum geçmişinde görünmesi gerekiyor.

**Acceptance Scenarios**:

1. **Given** /dashboard/settings sayfası açık, **When** sayfa yüklenir, **Then** Yedekler İnşaat için tetikleme kartı (son koşum durumu, "Şimdi tetikle" butonu) diğer 3 tedarikçi kartıyla aynı sırada görünür
2. **Given** settings'te Yedekler tetikleme butonu basılır, **When** scrape başlatılır, **Then** kart "Çalışıyor" durumuna geçer, scrape tamamlandığında "Başarılı" durumuna döner ve son koşum bilgisi güncellenir
3. **Given** GitHub Actions workflow_dispatch arayüzü açık, **When** supplier dropdown açılır, **Then** "yedekler" seçeneği listelenir
4. **Given** scheduled cron tetiklenir, **When** koşum tamamlanır, **Then** Yedekler için scrape_runs tablosunda yeni bir satır (trigger_type=auto) oluşur ve UI'da "Son otomatik koşum" tarihi güncellenir
5. **Given** Yedekler credentials yanlış ayarlanmış, **When** otomatik scrape çalışır, **Then** failure logu üretilir, diğer tedarikçilerin koşumu etkilenmez, settings sayfasında Yedekler kartı "Başarısız" durumunu gösterir

---

### Edge Cases

- **Login formu sayfa yapısı diğer 3 sitenin hiçbirine benzemiyorsa** (örn. JavaScript ile dinamik form render, multi-step login wizard, captcha) — DOM keşif aşamasında tespit edilir; captcha varsa feature scope dışı (kullanıcıyla görüşülür)
- **Sipariş sayfası pagination kullanıyor** — Sadece ilk sayfa değil, tüm geçmiş siparişler taranmalı (en azından son N gün veya tüm "Açık/Aktif" siparişler). 008'deki gibi sayfa sayısı limit'i konabilir
- **Catalog sayfası 1000+ ürün içeriyor** — Tek sefer tüm catalog'u taramak çok uzun sürebilir; tipik B2B catalog 50-500 ürün civarında olduğu için baseline kabul edilir, problem çıkarsa pagination/batching eklenir
- **Bir ürünün ürün kodu Yedekler'de aynı, başka tedarikçilerde farklı şekilde formatlanmış** — Cross-supplier eşleştirme bu feature'da YOK; ürün kodları supplier_id ile birlikte unique tutulur (mevcut DB schema bunu zaten sağlıyor)
- **Sipariş tarihinin format'ı diğer 3 tedarikçiden farklı** (dd.MM.yyyy / MM/dd/yyyy / yyyy-MM-dd) — Parser site-özel olmalı, UTC ISO'ya normalize edilmeli
- **Aynı ürün kodu hem orders'tan hem catalog'tan gelir** — Mevcut idempotency kuralı (ON CONFLICT) ile aynı ürün için iki insert ezilmemeli; products tablosunda upsert davranışı korunmalı
- **Login session timeout** — Tek scrape oturumu 5dk'dan uzun sürerse Yedekler tarafında session düşebilir; orchestrator'ın mevcut 5dk timeout'u kanıtlanmış davranışı (006'da kuruldu); aşılırsa abort
- **Bir tedarikçi kartı UI'da yokken settings sayfasında 4. kart ekleme — layout** — Mevcut grid otomatik adapt etmeli (3 → 4 kart geçişi flex/grid wrap). Görsel inceleme gerekebilir

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST Yedekler İnşaat'ı 4. tedarikçi olarak suppliers tablosuna ekleyebilmeli (slug=yedekler, name=Yedekler İnşaat, base_url=bayi.yedekler.com.tr)
- **FR-002**: System MUST Yedekler B2B portalına 3 ayrı kimlik bilgisi (müşteri kodu, kullanıcı kodu, parola) ile login olabilmeli
- **FR-003**: System MUST kimlik bilgilerini güvenli şekilde saklamalı (lokal `.env.local`, production GitHub Secrets); kaynak koda asla yazılmamalı
- **FR-004**: System MUST Yedekler için sipariş scrape gerçekleştirebilmeli; her sipariş için sipariş no, tarih, durum, müşteri toplamı ile birlikte tüm sipariş kalemleri (ürün kodu, ürün adı, adet, KDV hariç birim fiyat) çekilmeli
- **FR-005**: System MUST Yedekler için catalog scrape gerçekleştirebilmeli; her ürün için ürün kodu, ürün adı, KDV hariç net özel fiyat çekilmeli; KDV oranı sayfadan okunabiliyorsa kaydedilmeli, okunamıyorsa %20 default kabul edilmeli
- **FR-006**: System MUST hem sipariş hem catalog scrape'i idempotent yapmalı; aynı koşum tekrar çalıştırıldığında duplicate satır eklememeli
- **FR-007**: System MUST catalog scrape başarısızlığını sipariş scrape'inden izole etmeli; biri patladığında diğeri çalışmaya devam etmeli (orchestrator izolasyonu, 006'da kuruldu)
- **FR-008**: System MUST Yedekler siparişlerini /dashboard'daki sipariş listesinde göstermeli; tedarikçi filtresinde "Yedekler İnşaat" seçeneği bulunmalı
- **FR-009**: System MUST Yedekler ürünlerinin fiyat değişimlerini /dashboard/zamlanan-urunler sayfasında göstermeli; tedarikçi filtresinde "Yedekler İnşaat" seçeneği bulunmalı
- **FR-010**: System MUST /dashboard/settings sayfasında Yedekler için tetikleme kartı göstermeli; "Şimdi tetikle" butonu işlevsel olmalı
- **FR-011**: System MUST manuel tetikleme akışında (settings + workflow_dispatch) "yedekler" supplier seçeneğini sunmalı
- **FR-012**: System MUST scheduled cron koşumlarında Yedekler'i de tetiklemeli; mevcut 3 tedarikçi ile aynı sıklıkta
- **FR-013**: System MUST scrape başarısızlık durumlarını (login fail, DOM bozulma, network, timeout) logla anlamlı failure mode etiketiyle kaydetmeli; kimlik bilgisi loglarda asla görünmemeli
- **FR-014**: System MUST mevcut 3 tedarikçinin (Enderyapı, İkizler, Levent) scrape akışlarına regresyon getirmemeli — bu feature öncesi/sonrası başarı oranı en az aynı kalmalı

### Key Entities *(include if feature involves data)*

- **Supplier (Yedekler İnşaat)**: 4. tedarikçi kaydı; slug, name, base_url. Mevcut suppliers tablosuna 1 yeni satır
- **Scrape Run (Yedekler)**: Yedekler için tetiklenen her scrape koşumunun durumu (running/success/partial/failed/aborted); mevcut scrape_runs tablosu kullanılır
- **Order (Yedekler)**: Yedekler'den çekilen siparişler; mevcut orders tablosu kullanılır, supplier_id farkı ile diğer tedarikçilerden ayrışır
- **Order Item (Yedekler)**: Sipariş içindeki ürün satırları; mevcut order_items tablosu kullanılır
- **Product (Yedekler)**: Catalog veya orders'tan tespit edilen ürünler; mevcut products tablosu kullanılır, idempotent upsert
- **Product Price Snapshot (Yedekler)**: Catalog scrape tarafından üretilen fiyat snapshot'ları; mevcut product_price_snapshots tablosu kullanılır

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Yedekler İnşaat sistemde tedarikçi olarak konfigüre edildikten sonra ilk manuel scrape koşumunda en az 1 sipariş + ürün kalemleri DB'ye yazılır; ikinci koşumda duplicate satır oluşmaz
- **SC-002**: Yedekler catalog scrape ilk koşumda en az 10 ürün için fiyat snapshot'ı üretir (Yedekler catalog'unda bu kadar ürün varsa); ikinci koşumda aynı gün için snapshot artmaz
- **SC-003**: /dashboard sipariş listesi Yedekler eklendikten sonra 4 tedarikçinin siparişlerini tek listede gösterir, tedarikçi filtresi 4 seçenek sunar
- **SC-004**: /dashboard/zamlanan-urunler sayfasında fiyatı değişmiş bir Yedekler ürünü olduğunda o ürün listede görünür ve filtre 4 tedarikçiyi sunar
- **SC-005**: Yedekler catalog scrape başarısızlığı tek bir koşumda sipariş scrape'inin başarı oranını düşürmez (zaten kanıtlı izolasyon, regresyon testi)
- **SC-006**: Settings sayfasındaki Yedekler tetikleme kartı sayfa yüklemesinden sonra 2 saniye içinde görünür durumda olur ve "Şimdi tetikle" butonu basıldığında 5 saniye içinde "Çalışıyor" durumuna geçer
- **SC-007**: Scheduled cron koşumu Yedekler için tetiklendikten sonra başarılı tamamlanma oranı diğer tedarikçilerinkiyle aynı seviyededir (deploy sonrası ilk 7 gün ölçümü)
- **SC-008**: Mevcut 3 tedarikçinin (Enderyapı, İkizler, Levent) scrape başarı oranı bu feature'ın deploy'undan sonra düşmez (regresyon kontrolü)

## Assumptions

- **Aktör tek**: Sistem tek bir nalbur işletmesi sahibi tarafından kullanılır; multi-tenant değildir; başka kullanıcı eklemek scope dışı
- **B2B login engelsiz**: Yedekler login formu captcha, 2FA veya geçici kilit içermiyor (kullanıcı manuel login yapabildiğini doğruladı; otomatik login için anlamlı bir engel yok varsayımı)
- **Mevcut altyapı yeterli**: 003 (schema), 006 (catalog patterns), 007 (workflow_dispatch + cron), 008 (multi-supplier adapter pattern), 009 (catalog generalization) altyapısı korunur; yeni feature bu omurgaya ekleme yapar, omurgada değişiklik yapmaz
- **KDV varsayımı**: Ürün sayfasında KDV oranı yoksa %20 default kabul edilir (Türkiye'de standart KDV oranı)
- **Tek dil**: UI Türkçe kalır; yeni metin sadece "Yedekler İnşaat" tedarikçi adı + slug
- **Görsel scrape opsiyonel**: Eğer Yedekler liste sayfasında ürün görseli src'i ulaşılabilir ise eklenir; modal-tabanlı ise atlanır (İkizler 011'e ertelenmiş pattern'i takip edilir); kapsam dışı kalmak temel kabul edilir, eklenirse bonus
- **Sayfa hacmi makul**: Yedekler catalog'unun toplam ürün sayısı 50-500 aralığındadır (B2B tipiği); pagination gerekirse implementation aşamasında hallederiz
- **Anti-goal'ler katı**: Stok takibi, alternatif ürün öneri, cross-supplier SKU eşleştirme, e-posta/push bildirim — hiçbiri bu feature'da YOK; gerekirse ayrı feature spec'i açılır
- **Kimlik bilgileri lokal hazır**: Kullanıcı `.env.local`'a 3 değeri eklemiş durumda; production deploy için GitHub Secrets ve Vercel env'e taşınması ayrı bir manuel adımdır
- **Production smoke ertelenebilir**: P1 + P2 lokal yeşil olduktan sonra production deploy bir sonraki adımdır; spec'in onayı için production'da çalışıyor olması şart değil
