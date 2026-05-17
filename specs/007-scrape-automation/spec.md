# Feature Specification: Otomatik scrape pipeline (UI ayarı + cron + manuel tetikle)

**Feature Branch**: `007-scrape-automation`

**Created**: 2026-05-17

**Status**: Draft

**Input**: User description: "Eker Ticaret çalışanı (son kullanıcı, sıfır teknik) dashboard'dan tedarikçi scrape'lerini yönetir. Günlük saatte otomatik çalışsın + 'Şimdi tetikle' butonu olsun. Terminal komutu kullanmayacağım — son kullanıcı kullanacak."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - "Şimdi tetikle" ile manuel scrape başlatma (Priority: P1)

Eker Ticaret çalışanı dashboard'a giriş yapar, `/dashboard/settings` sayfasına gider, **"Şimdi tetikle"** butonuna basar. Buton birkaç saniye içinde "Tetiklendi ✓" durumuna geçer ve aynı sayfada "Son koşumlar" listesinin en üstüne yeni bir kayıt eklenir (status: `running`). Birkaç dakika sonra sayfayı yenilediğinde aynı kayıt `success` (veya `partial` / `failed`) durumuna düşer ve siparişler/fiyat değişimleri sayfalarında yeni veri görünür.

**Why this priority**: Son kullanıcı dashboard'u sahiplenir sahiplenmez ihtiyaç duyduğu şey budur — terminal açmadan, geliştirici yardımı olmadan, "bugünkü fiyatları çekelim" dediği anda tek tıkla çalıştırmak. Otomasyon olmadan dashboard zaten varolan veriyi gösteriyor; bu hikâye olmadan ürün **kullanılabilir hale gelmiyor**. P1 olmadan diğer hikâyeler anlamsız.

**Independent Test**: Settings sayfası boş bir scrape geçmişiyle açılır → kullanıcı tedarikçiyi (Enderyapı) seçer → "Şimdi tetikle"'ye basar → 5 dk içinde geçmiş listesinde 1 başarılı/kısmi koşum görünür → sipariş listesinde ve "Zamlanan ürünler" sayfasında yeni snapshot'lar erişilebilir.

**Acceptance Scenarios**:

1. **Given** kullanıcı authenticated ve settings sayfasında, **When** "Şimdi tetikle" butonuna basar, **Then** sayfa "Tetiklendi — son durum birkaç dakika içinde görünür" mesajı gösterir ve geçmiş listesinin başına `running` veya `queued` durumlu yeni satır eklenir.
2. **Given** manuel tetikleme yapılmış, **When** kullanıcı 3-5 dk sonra sayfayı yeniler, **Then** koşum kaydı `success` / `partial` / `failed` durumuna geçmiş olur ve özet bilgi (kaç sipariş, kaç fiyat snapshot, kaç hata) görünür.
3. **Given** son tetikleme başarısız, **When** kullanıcı geçmiş kaydındaki satıra bakar, **Then** hata özeti (örn. "login-failed", "timeout") okunabilir — credential'lar veya stack trace **kesinlikle** ekrana basılmaz.
4. **Given** kullanıcı tetikleme butonuna 30 sn içinde tekrar basmaya çalışır, **When** önceki tetikleme henüz tamamlanmadı, **Then** buton "Devam ediyor — bekleyin" olarak disabled gösterilir; ikinci bir koşum başlatılmaz.

---

### User Story 2 - Günlük scrape saatini ayarlama (Priority: P2)

Eker Ticaret çalışanı `/dashboard/settings` sayfasında tedarikçi başına **Otomatik scrape: aç/kapa** toggle'ı ve **Günlük saat** seçicisi (00-23 dropdown, UTC açıklaması ile birlikte) görür. Saati 09:00 yapıp kaydeder; ertesi sabah dashboard'a girdiğinde "Son koşum: bugün 09:04, success" yazısını ve yeni siparişleri görür. İhtiyaç duyduğu zaman toggle'ı kapatıp scrape'i durdurabilir.

**Why this priority**: Manuel tetikleme zaten US1 ile çalışıyor; otomasyon olmadan da kullanıcı ürünü kullanabilir, sadece her gün hatırlaması gerekir. US1 kadar kritik değil — ancak son kullanıcının "sabah dashboard'u açıyorum, dünden bu yana ne değişmiş?" pratiğini destekleyen ana otomasyon halkası budur. P2 olmadan ürün tam değer üretmez.

**Independent Test**: Settings sayfasında saat dropdown'u 09 olarak ayarlanır → toggle "Aktif" konumuna getirilir → kaydedilir → saat 09:00 UTC geçtikten sonra (test için saat değiştirilerek veya simulate edilerek) geçmiş listesinde otomatik tetiklenmiş yeni koşum görünür.

**Acceptance Scenarios**:

1. **Given** scrape kapalı, **When** kullanıcı toggle'ı açar, saati 09 seçer ve "Kaydet"e basar, **Then** sayfa "Ayar kaydedildi. Sonraki otomatik scrape: yarın 09:00 UTC" mesajı gösterir.
2. **Given** scrape açık ve saat 09 olarak ayarlı, **When** 09:xx UTC saatinde dashboard ziyaret edilirse, **Then** son koşum listesinde aynı gün 09:00 civarında `success` veya `partial` durumlu otomatik tetiklenmiş koşum görünür.
3. **Given** scrape açık, **When** kullanıcı toggle'ı kapatır ve kaydeder, **Then** sonraki gün aynı saatte yeni bir koşum **oluşmaz**; sadece manuel tetikleme çalışmaya devam eder.
4. **Given** kullanıcı saati 14 olarak değiştirir, **When** kaydeder, **Then** geçmiş ekranında "Sonraki otomatik scrape: yarın 14:00 UTC" yazısı güncellenir.

---

### User Story 3 - Scrape geçmişi inceleme (Priority: P2)

Kullanıcı settings sayfasında **"Son koşumlar"** bölümünde son 10 scrape kaydını görür: tarih-saat, tetikleme tipi (otomatik / manuel), tedarikçi, durum rozeti (success/partial/failed), kısa özet (kaç sipariş + kaç snapshot eklendi, varsa kaç hata). Bir satıra tıkladığında daha fazla detay (hata listesi varsa) genişler.

**Why this priority**: US1 ve US2 başarılı çalıştığında bile kullanıcı "geçen gece çalıştı mı?" diye sormak isteyecek. Şeffaflık için kritik ama US1/US2 olmadan görüntülenecek bir veri yok. P2'de tutuldu çünkü US1+US2 zaten DB'ye kayıt yazıyor; sadece UI'da göstermek lazım.

**Independent Test**: En az 1 manuel + 1 otomatik koşum tamamlandıktan sonra settings sayfası açılır → "Son koşumlar" tablosunda 2 satır görünür (en yeni üstte) → her satırın tarih, tetikleme tipi, durum, özet alanları doğru görünür.

**Acceptance Scenarios**:

1. **Given** son 24 saat içinde 3 koşum çalıştırılmış, **When** kullanıcı settings'i açar, **Then** "Son koşumlar" bölümü 3 satır (en yeni en üstte) gösterir.
2. **Given** `partial` durumlu bir koşum, **When** kullanıcı o satıra tıklar, **Then** hata özeti (mode + kısa açıklama, **credential içermeyen**) genişler.
3. **Given** son 30 günde 50+ koşum var, **When** kullanıcı sayfayı açar, **Then** sadece en yeni 10 koşum gösterilir; daha eski koşumlar gizlenir (V1 kapsamı).

---

### Edge Cases

- **Aynı anda çift tetikleme**: Kullanıcı butona iki kez basar veya otomatik saat geldiğinde manuel koşum hâlâ devam ediyor olur → ikinci tetikleme reddedilir veya kuyruğa konulmaz (sıralı tek koşum); UI butonda "Devam ediyor" durumu gösterir.
- **Pipeline başlatılamadı (deploy/credential sorunu)**: "Şimdi tetikle" işlemi pipeline'a yetki/erişim sebebiyle ulaşmazsa kullanıcıya teknik detay içermeyen mesaj ("Tetikleme başlatılamadı, sistem yöneticisi ile irtibata geçin") gösterilir; sayfa kırılmaz.
- **Saat dilimi karışıklığı**: Kullanıcı 09 seçer ama Türkiye saatiyle 09 mu, UTC ile 09 mu olduğunu bilmez → seçici yanında **"saat UTC'dir; Türkiye için +3 saat"** açıklaması zorunlu.
- **Tedarikçi sitesi down**: Otomatik koşum login-failed/timeout'la biter → koşum `failed` kaydedilir, kullanıcı bir sonraki gün otomatik koşumun tekrar deneneceğini bilir; arada manuel tetikleyebilir.
- **Hiç koşum yok**: İlk açılışta "Son koşumlar" listesi boştur → "Henüz scrape yapılmadı — başlatmak için 'Şimdi tetikle'ye basın" boş durumu gösterilir.
- **Kredilerin yetersizliği / harici servis tarifesi aşımı**: Otomatik koşum altyapısı (compute saatleri) sınırına ulaşırsa son kullanıcıya açık mesaj döner; pipeline sessizce çalışmaz.

## Requirements *(mandatory)*

### Functional Requirements

**Settings sayfası (UI):**

- **FR-001**: Sistem, authenticated kullanıcı için `/dashboard/settings` sayfası SUNMALI; üst menüde (top-bar) bu sayfaya bir bağlantı görünür olmalı.
- **FR-002**: Settings sayfası, kayıtlı her tedarikçi (V1'de Enderyapı) için ayrı bir kart göstermeli; kart şu kontrolleri içermeli: "Otomatik scrape aç/kapa" toggle, "Günlük saat" 00-23 dropdown'u, "Şimdi tetikle" butonu, son durum özeti.
- **FR-003**: Saat seçici, kullanıcıya seçilen saatin **UTC** olduğunu ve **Türkiye saatiyle +3 saat farkı bulunduğunu** açıkça belirtmeli (örn. "09:00 UTC = 12:00 İstanbul").
- **FR-004**: "Kaydet" butonu yalnızca form değişiklikleri kaydedildiğinde aktif olmalı; başarılı kayıttan sonra kullanıcıya "Ayar kaydedildi" geri bildirimi verilmeli.
- **FR-005**: "Şimdi tetikle" butonu, tetikleme isteği gönderildikten sonra disabled (devam ediyor) durumuna geçmeli ve son durum birkaç dakika sonra UI yenilemesiyle güncellenmeli.

**Otomasyon (cron tetikleme):**

- **FR-006**: Sistem, tedarikçi başına ayarlanmış aktif günlük saatte her gün bir kez scrape pipeline'ını otomatik tetiklemeli.
- **FR-007**: Toggle "kapalı" olan tedarikçiler için otomatik tetikleme yapılmamalı.
- **FR-008**: Sistem; saat değişikliği veya toggle değişikliği sonrası UI'da "Sonraki otomatik scrape: <tarih> <saat> UTC" özetini göstermeli.

**Manuel tetikleme:**

- **FR-009**: "Şimdi tetikle" butonu, son kullanıcı tarafından terminal/komut satırı kullanılmadan, sadece dashboard üzerinden çalışan bir tetikleme yolu sağlamalı.
- **FR-010**: Manuel tetikleme isteği kısa sürede (< 5 sn) "alındı" yanıtı dönmeli; gerçek scrape arka planda çalışmalı ve sonuç birkaç dakika içinde geçmiş listesinde görünmeli.

**Tek seferlik koşum (concurrency):**

- **FR-011**: Aynı tedarikçi için aynı anda birden fazla scrape çalıştırılmamalı; mevcut koşum devam ederken yeni tetikleme reddedilmeli (UI'da uygun mesaj).

**Geçmiş kayıtları:**

- **FR-012**: Sistem; her scrape koşumunu (otomatik veya manuel) başlangıç zamanı, bitiş zamanı, tetikleme tipi (otomatik/manuel), tedarikçi, durum (success/partial/failed/running), ve özet metrikler (sipariş sayısı, snapshot sayısı, hata sayısı) ile saklamalı.
- **FR-013**: Settings sayfası, tedarikçi başına son 10 koşumu en yeni-en üstte sıralı şekilde göstermeli.
- **FR-014**: Başarısız veya partial koşumlar için kullanıcı, koşum satırına tıkladığında hata özeti (failure mode etiketleri + kısa açıklama) görebilmeli.

**Güvenlik & gizlilik (CONSTITUTION G6/G15/G3 ile uyumlu):**

- **FR-015**: B2B tedarikçi kimlik bilgileri (kullanıcı adı/şifre) kaynak kodda **bulunmamalı**; gizli yapılandırma deposunda saklanmalı ve yalnızca otomasyon ortamına erişilebilir olmalı.
- **FR-016**: Yönetici/admin tokenleri (otomasyonu tetiklemek için kullanılan harici platform PAT'leri vs.) son kullanıcının kişisel cihaz/tarayıcısına **asla** sızdırılmamalı; tetikleme yalnızca server tarafı üzerinden yapılmalı.
- **FR-017**: Hata mesajları, log satırları ve scrape geçmiş kayıtları **kesinlikle** kullanıcı adı / şifre / token gibi gizli bilgileri içermemeli; yalnızca anlamlı failure-mode etiketleri saklanmalı.

**Yetkilendirme:**

- **FR-018**: Settings sayfası ve manuel tetikleme işlemi yalnızca authenticated kullanıcılar tarafından erişilebilir olmalı; logged-out kullanıcı `/login`'e yönlendirilmeli.

### Key Entities *(include if feature involves data)*

- **Scrape Schedule (Tedarikçi başına zamanlama)**: Bir tedarikçinin otomatik scrape durumunu temsil eder. Önemli alanlar: tedarikçi referansı (1:1), otomasyon aktif mi (boolean), günlük tetikleme saati (0-23 UTC), son tetikleme zamanı, son tetikleme durumu. Tek satır per tedarikçi.

- **Scrape Run (Koşum geçmişi — mevcut)**: Halihazırda var olan `scrape_runs` kavramı; bu feature, kayda **tetikleme tipi** (`auto` | `manual`) bilgisini ekler. Diğer alanlar (status, summary, errors) değişmeden kalır.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Eker Ticaret çalışanı (sıfır teknik bilgi varsayımı), settings sayfasını ilk kez açtığı andan otomatik scrape ayarını aktive ettiği ana kadar **3 dakikadan kısa sürede** ulaşabilmeli; herhangi bir terminal komutu veya geliştirici yardımı gerekmemeli.

- **SC-002**: Otomatik scrape aktif ve saat 09 olarak ayarlı bir tedarikçi için, ardışık 7 günün **en az 6'sında** koşum başlatılmış ve `success` ya da `partial` durumunda tamamlanmış olmalı (≥85% başarı oranı).

- **SC-003**: "Şimdi tetikle" butonuna basıldıktan sonra **5 saniye içinde** UI geri bildirim vermeli (tetikleme alındı); arka planda scrape **5 dakika içinde** tamamlanıp geçmiş kaydı `success`/`partial`/`failed` durumuna düşmeli.

- **SC-004**: Son kullanıcı `/dashboard/settings` sayfasında, son **10 koşumun** her birinin durumunu ve özetini hiç scroll yapmadan veya başka bir sayfa ziyaret etmeden görebilmeli.

- **SC-005**: Sistem üretim ortamında 3 ay boyunca çalıştığında, bu feature ile ilgili **ek operasyonel maliyet oluşturmamalı** (CONSTITUTION'un "Sıfır maliyet" ilkesi gereği, otomatik tetikleme ve cron için kullanılan harici servis ücretsiz kotada kalmalı).

- **SC-006**: Tüm B2B kimlik bilgileri (Enderyapı kullanıcı adı/şifre) **kaynak kod tabanında veya kullanıcının cihazında** hiçbir yerde bulunmamalı; sızıntı taraması (gitleaks vb.) sıfır finding döndürmeli.

## Assumptions

- Son kullanıcı (Eker Ticaret çalışanı), yalnızca dashboard web arayüzünü kullanır; terminal, komut satırı veya geliştirici aracı kullanmaz. Tüm scrape kontrolleri UI'dan yapılmalı.
- V1'de yalnızca tek bir tedarikçi (Enderyapı) yapılandırılmıştır; çoklu tedarikçi UI'ı tablo olarak değil, kart listesi olarak sunulur ve yeni tedarikçi eklendiğinde otomatik olarak yeni kart belirir.
- "Günde 1 kez" sıklığı V1 için yeterlidir; saatlik veya 30-dakikalık scrape ihtiyaçları V2'ye ertelenmiştir.
- Kuyruk/queue mekanizması, gelişmiş retry stratejisi, çoklu eşzamanlı koşum desteği V1 kapsamı **dışındadır**. Tek seferlik tetikleme + reddetme yeterlidir.
- E-posta/SMS bildirimleri (scrape başarısız olduğunda uyarı) bu feature kapsamında **değildir**; ileride 010+ feature'ı olarak planlanabilir.
- Mevcut authentication sistemi (Supabase Auth, 001-auth-dashboard) yeniden kullanılır; settings sayfasına özel rol/permission eklenmez (tek-kullanıcı varsayımı).
- Cron tetiklemesi en yakın saatlik granülarite ile yapılır; "saat tam 09:00:00'da" değil, **"saat 09 dilimi içinde"** çalışması yeterlidir (gerçek tetikleme 09:00-09:59 arasında olabilir).
- Otomatik tetikleme ortamı (compute platformu) ücretsiz tier'da kalır ve günlük 1 tetikleme + ihtiyaç durumunda manuel tetiklemeler için yeterlidir.
- Tedarikçi kimlik bilgileri başlangıçta sistem yöneticisi (Halil) tarafından gizli yapılandırma deposuna manuel olarak yerleştirilir; son kullanıcının credential girmesi UI'da yapılmaz (V1 anti-goal — V2 için "tedarikçi yönetim" feature'ı olabilir).
- Sayfa yenilemesi (auto-refresh) gerekmez; kullanıcı tetiklemeden sonra sayfayı manuel olarak yenileyebilir veya bir sonraki ziyaretinde sonuçları görür.
