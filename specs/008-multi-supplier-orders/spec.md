# Feature Specification: İkizler + Levent Şimşek tedarikçileri (sipariş scrape)

**Feature Branch**: `008-multi-supplier-orders`

**Created**: 2026-05-17

**Status**: Draft

**Input**: User description: "İki yeni B2B tedarikçinin sipariş geçmişini sisteme entegre et: İkizler Hırdavat (http://bayi.ikizlerhirdavat.com) ve Levent Şimşek Armatür (https://liste.leventsimsekarmatur.com). Adapter mimarisi mevcut. Catalog (güncel fiyat) bu feature'da YOK — sadece sipariş geçmişi."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - İkizler siparişlerinin dashboard'da görünmesi (Priority: P1)

Eker Ticaret çalışanı `/dashboard/settings` sayfasına gittiğinde "Enderyapi B2B" kartının yanında **"İkizler Hırdavat"** kartını görür. Bu kartın "Şimdi tetikle" butonuna basar; birkaç dakika sonra "Son koşumlar" listesinde "Manuel · Başarılı · N sipariş · M satır" özetli yeni satır oluşur. Sonra "Siparişler" sayfasına gittiğinde tedarikçi filtresinden **"İkizler Hırdavat"** seçebilir; sadece o tedarikçinin siparişlerini görür. Bir siparişe tıkladığında detay sayfasında ürün kodları, miktarları ve birim alış fiyatları İkizler'in B2B sitesindeki gibi listelenir.

**Why this priority**: İki tedarikçi de Eker'in alım yaptığı kaynak — biri bile olmadan ürün portföyünün önemli bir kısmı (Enderyapi dışı) takip dışı kalıyor. İkizler genelde daha sık sipariş geçilen tedarikçi; önce o tamamlanırsa kullanıcı dashboard'un genişlemekte olduğunu hisseder.

**Independent Test**: İkizler hesabı için credentials .env.local'a eklenir → `npm run scrape:all -- --supplier ikizler --skip-catalog` çalıştırılır → DB'de `supplier_orders` tablosuna İkizler siparişleri eklenir → `/dashboard?supplier=ikizler` filtresinde görünür → detay sayfası satırları doğru.

**Acceptance Scenarios**:

1. **Given** İkizler hesabında geçmiş sipariş var ve credentials doğru, **When** kullanıcı settings sayfasında İkizler kartının "Şimdi tetikle"sine basar, **Then** 5 dk içinde "Son koşumlar"da `Manuel · Başarılı` satırı + `Siparişler` sayfasında yeni İkizler siparişleri görünür.
2. **Given** İkizler login başarısız (yanlış şifre veya 2FA), **When** scrape tetiklenir, **Then** koşum `Başarısız` statusüyle biter ve hata özeti "login-failed" mode'unu gösterir; credentials log/UI'a sızmaz.
3. **Given** İkizler sitesi geçici olarak çevrimdışı (timeout), **When** scrape tetiklenir, **Then** koşum `Başarısız` (timeout mode), sistem 1 sonraki manuel/otomatik tetiklemede yeniden dener, daha önce çekilmiş veriler korunur.
4. **Given** İkizler'de 3 ay önce çekilmiş 10 sipariş zaten DB'de, **When** scrape tekrar çalışır, **Then** mevcut siparişler atlanır (`orders_skipped: 10`), yeni eklenen yoksa `orders_inserted: 0` — idempotency korunur.

---

### User Story 2 - Levent Şimşek siparişlerinin dashboard'da görünmesi (Priority: P1)

Yukarıdaki US1 ile aynı akış, ama bu kez **"Levent Şimşek Armatür"** tedarikçisi için. Settings sayfasında 3. kart görünür, "Şimdi tetikle" → sipariş scrape → dashboard'da filtreleme çalışır.

**Why this priority**: Eker'in armatür ürün kategorisini bu tedarikçi besliyor. İkizler ile aynı önemde — ikisi paralel implement edilebilir (farklı dosyalarda farklı adapter'lar).

**Independent Test**: Levent Şimşek için credentials eklenir → `npm run scrape:all -- --supplier leventsimsek --skip-catalog` → DB'de Levent Şimşek siparişleri görünür → `/dashboard?supplier=leventsimsek` filtresi çalışır.

**Acceptance Scenarios**:

1. **Given** Levent Şimşek hesabı aktif, **When** scrape tetiklenir, **Then** `Manuel · Başarılı · N sipariş · M satır` özetiyle "Son koşumlar"a kaydedilir ve `Siparişler` sayfasında filtrelenebilir.
2. **Given** Levent Şimşek DOM yapısı bayipro platform'undan farklı (PHP tabanlı), **When** sipariş scrape edilir, **Then** ürün kodu, miktar, birim fiyat alanları İkizler/Enderyapi ile aynı formatta DB'ye yazılır — UI gözünde fark olmaz.
3. **Given** Levent Şimşek'te 50 sipariş var, **When** ilk scrape çalışır, **Then** tümü tek koşumda işlenir (timeout 10 dk içinde); workflow başarıyla tamamlanır.

---

### User Story 3 - Çoklu tedarikçi cron tetiklemesi (Priority: P2)

Settings sayfasında her tedarikçi için aç/kapa toggle ve saat ayarı bağımsız çalışır. Halil İkizler için saat 09:00, Levent Şimşek için saat 10:00 İstanbul ayarladığında her gün ilgili saatte yalnız o tedarikçi otomatik tetiklenir; diğeri kendi saatinde tetiklenir. Üç tedarikçi (Enderyapi + 2 yeni) aynı saatte ayarlanırsa GitHub Actions concurrency.group sayesinde **paralel** çalışır (her birinin kendi runner instance'ı var, birbirini engellemiyor).

**Why this priority**: V1 kapsamında manuel tetikleme yeterli (US1, US2). Otomatik tetikleme her tedarikçi için bağımsızlık ister; bu zaten mevcut altyapı (per-supplier `scrape_schedule` satırı), yeni iş yok. Sadece doğrulanmalı.

**Independent Test**: 3 tedarikçi de farklı saatlerde aktive edilir → 24 saat içinde 3 ayrı `trigger_type='auto'` `scrape_runs` satırı (her biri kendi tedarikçisi için) DB'de görünür.

**Acceptance Scenarios**:

1. **Given** Enderyapi 09:00, İkizler 10:00, Levent Şimşek 11:00 İstanbul aktif, **When** 24 saat geçer, **Then** scrape_runs'da 3 ayrı otomatik koşum (her biri kendi saatinde, kendi tedarikçisi için).
2. **Given** İkizler `enabled=false`, **When** cron çalışır, **Then** sadece Enderyapi ve Levent Şimşek tetiklenir; İkizler için 0 koşum.

---

### Edge Cases

- **Sipariş listesi sayfası pagination** (50+ sipariş): site sayfa bölme yapıyorsa adapter "Sonraki sayfa" linkini takip edebilmeli; aksi halde son sayfa eksik kalır.
- **Ürün kodu farklı format**: İkizler/Levent Şimşek "PRD-123" gibi farklı format kullanıyor olabilir → DB'de `product_code` text olduğu için sorun değil; ama `products.code` benzersizliği `(supplier_id, code)` üzerinden — farklı tedarikçilerde aynı code çakışmaz.
- **Sipariş statüsü farklı terimler**: "Onaylandı" vs "Tamamlandı" vs "Beklemede" — terimler tedarikçi sitesinden olduğu gibi alınır, normalize edilmez (siparişler sayfasında filtre dropdown'u açık etiketleri gösterir).
- **HTTP (İkizler) güvenliği**: Eker tarafından kabul edilen risk; ek mitigation yok. Workflow runner'ı her zaman HTTP'ten istek atar (Playwright ayarı).
- **2FA / captcha**: Bu siteler düz user/şifre destekliyor (kullanıcı doğruladı). Yine de adapter login fonksiyonu unexpected 2FA prompt'unu tespit edip "2fa-required" mode'uyla fail eder.
- **Sipariş geçmişi boş**: Yeni hesap → sıfır sipariş — `orders_total: 0`, koşum `Başarılı` kabul edilir, "Henüz sipariş yok" mesajı UI tarafında zaten var.
- **DOM değişimi**: Tedarikçi siteyi güncellerse adapter selector'ları kırılır. Run "Başarısız" olur, hata özetinde "selector-not-found" benzeri mode görünür. Bu durumda manuel adapter güncellemesi gerekir (yeni bir minor feature olarak).

## Requirements *(mandatory)*

### Functional Requirements

**Yeni tedarikçi entegrasyonu:**

- **FR-001**: Sistem; İkizler Hırdavat (`http://bayi.ikizlerhirdavat.com`) ve Levent Şimşek Armatür (`https://liste.leventsimsekarmatur.com`) sitelerine **authenticated login** yapabilmeli ve session'ı koruyabilmeli.
- **FR-002**: Sistem; her tedarikçinin **sipariş geçmişi listesini** okuyabilmeli — sipariş numarası, tarih, durum, toplam tutar alanları zorunlu.
- **FR-003**: Sistem; her sipariş için **detay sayfasını** açıp **ürün satırlarını** ayıklayabilmeli — ürün kodu, ürün adı, miktar, birim alış fiyatı alanları zorunlu.
- **FR-004**: Sistem; çekilen sipariş ve ürün satırı verilerini mevcut `supplier_orders` ve `order_items` DB şemalarına **idempotent** şekilde yazabilmeli (aynı sipariş çift kaydedilmez).
- **FR-005**: Sistem; sipariş listesi pagination'ı olan sitelerde son sayfaya kadar takip edebilmeli (eğer site pagination kullanıyorsa).

**DB seed:**

- **FR-006**: Sistem; ilk deploy'da `suppliers` tablosuna iki yeni satır eklemiş olmalı: `slug = 'ikizler'` ve `slug = 'leventsimsek'` (display name, base URL ile).
- **FR-007**: Sistem; her yeni tedarikçi için `scrape_schedule` tablosunda **default disabled** (enabled=false), `daily_hour_utc=9` satır oluşturmuş olmalı; kullanıcı settings'ten aktive edebilir.

**UI (otomatik):**

- **FR-008**: Settings sayfası mevcut "tedarikçi başına kart" deseni sayesinde **kod değişikliği olmadan** yeni eklenen tedarikçileri **otomatik kart olarak** göstermeli.
- **FR-009**: Siparişler dashboard sayfasındaki tedarikçi filtresi **otomatik olarak** yeni tedarikçileri seçenek olarak listeleyebilmeli.

**Güvenlik:**

- **FR-010**: B2B kimlik bilgileri (`IKIZLER_USERNAME/PASSWORD`, `LEVENTSIMSEK_USERNAME/PASSWORD`) yalnızca GitHub Repo Secrets ve lokal `.env.local`'da bulunmalı; kaynak kod tabanına commit edilmemeli.
- **FR-011**: Login başarısız, network hatası veya parse hatası durumlarında hata mesajlarında kullanıcı adı/şifre **kesinlikle** görünmemeli; sadece failure-mode etiketleri (`login-failed`, `timeout`, `parse-failed` vb.) ve sebep özetleri saklanmalı.
- **FR-012**: Sistem; İkizler'in HTTP (HTTPS değil) site olmasını kabul edilmiş risk olarak işaretlemeli (Constitution'a not düşülmüş olarak); özel mitigation gerekmez.

**Adapter mimari yaklaşımı:**

- **FR-013**: Her tedarikçi için **bağımsız adapter modülü** olmalı; bir adapter'ın hatası diğer adapter'ları etkilememeli (workflow level'da concurrency.group ile zaten ayrı).
- **FR-014**: Adapter'lar **standart Adapter interface'ini** uygulamalı (mevcut Enderyapı adapter'ı ile aynı kontrat: `login`, `listOrders`, `getOrderDetail`); `scrapeCatalog` opsiyonel — bu feature'da gerek yok.

**Test:**

- **FR-015**: Her adapter için manuel test akışı (`scrape:all --supplier <slug> --skip-catalog`) yerel ortamda çalışabilmeli; production deploy öncesi geliştirici test edebilmeli.

### Key Entities *(include if feature involves data)*

Bu feature mevcut DB şemasını **kullanır** (yeni tablo eklenmez):

- **`suppliers`**: 2 yeni satır (`ikizler` + `leventsimsek` slug'lı). Mevcut alanlar: id, slug, name, base_url, created_at, updated_at.
- **`scrape_schedule`**: 2 yeni satır (her supplier için 1; enabled=false, daily_hour_utc=9 default).
- **`supplier_orders`**: Yeni siparişler eklenir (mevcut yapı; `supplier_id` FK üzerinden tedarikçiye bağlı).
- **`order_items`**: Yeni satırlar eklenir; `product_id` initially null, sonraki catalog scrape (009 feature'ı) ile back-fill yapılır.
- **`scrape_runs`**: Her tetikleme için satır oluşur (mevcut yapı; `trigger_type` ve `supplier_id` üzerinden).

**Yeni tablo, yeni RPC, yeni RLS politikası gerekmez** — şema yeterli.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Her iki tedarikçi (İkizler + Levent Şimşek) için ilk manuel scrape **production ortamında 10 dakika içinde** tamamlanmalı ve "Başarılı" statusüyle bitmeli (en az 1 sipariş çekilmiş varsayımıyla).

- **SC-002**: Sipariş listesi sayfasında tedarikçi filtresinde her iki yeni tedarikçi **görünmeli** ve seçildiğinde **yalnız o tedarikçinin siparişlerini** göstermeli (filter doğruluğu).

- **SC-003**: Sipariş detay sayfasında ürün kod + miktar + birim fiyat alanları **B2B sitedeki değerle birebir eşleşmeli** (en az 3 örnek siparişin manuel karşılaştırması).

- **SC-004**: Aynı scrape script'i ardarda 2 kez çalıştırıldığında **idempotent** olmalı — ikinci koşumda `orders_inserted=0, items_inserted=0` (mevcut atlandı) görünmeli.

- **SC-005**: Tüm B2B kimlik bilgileri (İkizler, Levent Şimşek) **kaynak kod tabanında veya kullanıcının cihazındaki tarayıcısında** hiçbir yerde bulunmamalı; sızıntı taraması (`git grep`) 0 finding döndürmeli.

- **SC-006**: Settings sayfası açıldığında **3 tedarikçi kartı** (Enderyapi + İkizler + Levent Şimşek) **otomatik olarak** görünmeli — UI kod değişikliği olmadan.

- **SC-007**: Bu feature'ın aylık compute maliyeti **0 TL kalmalı** — GitHub Actions free tier (2000 dk/ay) ve Vercel Hobby planı limitleri içinde, 3 tedarikçi × günlük 1 cron tetiklemesi rahat sığar.

## Assumptions

- İkizler ve Levent Şimşek hesapları aktif; **geçmiş sipariş** kayıtları var (kullanıcı doğruladı). Boş hesap durumunda sıfır sipariş normal kabul edilir, hata değil.
- Her iki site **düz username/password** kabul ediyor; 2FA, OTP veya captcha **yok** (kullanıcı doğruladı). Eğer süreç içinde captcha gelirse adapter "captcha" mode'uyla fail eder ve feature kapsamı genişletilir.
- İkizler **HTTP** (HTTPS değil) — credential plaintext riski Eker Ticaret tarafından kabul edilmiş; aksi yönde bir teknik mitigation V1'de YOK (her zaman risk olarak bilinir).
- Her iki tedarikçi siteleri **bayipro değil** — farklı platformlar (İkizler ASP.NET MVC pattern, Levent Şimşek PHP/index.php). DOM keşfi sıfırdan yapılır; bayipro CSS class konvansiyonları geçerli değil.
- DOM keşfi **iteratif** yapılır — geliştirici her site için 2-5 saatlik selector tespit + test fazı bekler (Enderyapi 006'da 4 iterasyon almıştı).
- Sipariş listesi en azından son **3-6 ay**'ı kapsıyor (kullanıcı tarafından test verisi yeterli); daha eski sipariş gerekirse "tarih filtresi yok, hepsi çekilir" pattern'i kullanılır.
- **Catalog scrape (güncel fiyat snapshot) bu feature'da YOK.** Sadece sipariş geçmişi. Catalog phase **009 feature'ı** olarak ertelendi; önce sipariş scrape akışı stabilize edilir, sonra her tedarikçi için ayrı catalog adapter'ı yazılır.
- Mevcut "Şimdi tetikle" UI butonu ve cron altyapısı (007) yeni tedarikçiler için **otomatik olarak çalışır** — sadece `slug` parametresi farklıdır, kod değişikliği yok.
- Mevcut "Zamlananlar" sayfası bu feature kapsamında **iş üretmez** çünkü yeni snapshot eklenmiyor; ancak gelecekte (009 catalog feature'ından sonra) yeni tedarikçilerin fiyat değişimleri orada görünür.
- Mevcut Constitution kararları (G15 GitHub Secrets, G16 DB schedule, vs.) yeni tedarikçiler için aynı uygulanır — yeni mimari karar gerekmez.
