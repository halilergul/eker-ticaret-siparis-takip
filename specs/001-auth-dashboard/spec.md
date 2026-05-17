# Feature Specification: Auth + Boş Dashboard İskeleti

**Feature Branch**: `001-auth-dashboard`

**Created**: 2026-05-15

**Status**: Draft

**Input**: User description: "Auth + boş dashboard iskeleti. Tek kullanıcı için Supabase Auth ile giriş ekranı, başarılı giriş sonrası /dashboard'a yönlendirme, üst barda merhaba kullanıcı + çıkış butonu. /dashboard auth korumalı (giriş yapmamış kullanıcı /login'e atılır). Auth yöntemi şu an için email + şifre (magic link sonra). Kapsam dışı: Şifre sıfırlama, kayıt akışı (tek kullanıcı, kaydı sonra elle yaratacağız), 2FA, sosyal auth."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Tek kullanıcı giriş yapıp korumalı panele ulaşır (Priority: P1)

Eker Ticaret çalışanı `/login` sayfasında email ve şifresini girer; doğru bilgilerle `/dashboard`'a yönlendirilir ve üst barda kendi adıyla bir karşılama görür. Giriş yapmamış biri doğrudan `/dashboard` URL'ine ulaşmaya çalıştığında otomatik olarak `/login`'e atılır.

**Why this priority**: Bu MVP'nin kendisi. Bu olmadan herhangi bir korumalı veri (sipariş geçmişi, fiyat snapshot'ı, ayarlar) görüntülenemez. Sonraki tüm feature'lar bu temele oturur. Aynı zamanda V1'in tek güvenlik duvarıdır — auth açılmamışsa bütün dashboard public web'de durur.

**Independent Test**: auth sağlayıcısının yönetim panelinden manuel oluşturulmuş bir hesapla `/login`'e gidip doğru bilgilerle giriş yapılır; `/dashboard`'a yönlendirildiği ve "Merhaba <email>" karşılamasının göründüğü doğrulanır. Ayrı bir tarayıcı/incognito penceresinden direkt `/dashboard` URL'i denenir; `/login`'e yönlendirme yaptığı doğrulanır.

**Acceptance Scenarios**:

1. **Given** kullanıcı giriş yapmamış ve `/login` sayfasındadır, **When** geçerli email ve doğru şifreyi girip "Giriş Yap" butonuna basar, **Then** sistem oturum açar ve kullanıcıyı `/dashboard`'a yönlendirir; üst barda "Merhaba <email>" yazısı görünür.
2. **Given** kullanıcı giriş yapmamıştır, **When** doğrudan `/dashboard` URL'ine gitmeye çalışır, **Then** sistem otomatik olarak `/login` sayfasına yönlendirir ve oradaki içeriği göstermez.
3. **Given** kullanıcı `/login` sayfasındadır, **When** geçerli email ama yanlış şifre ile giriş dener, **Then** sistem "Email veya şifre hatalı" mesajını gösterir; hangi alanın yanlış olduğunu (email'in var olup olmadığını) sızdırmaz; kullanıcıyı `/dashboard`'a yönlendirmez.
4. **Given** kullanıcı zaten giriş yapmıştır, **When** doğrudan `/login` URL'ine giderse, **Then** sistem onu otomatik olarak `/dashboard`'a yönlendirir (tekrar giriş istemez).

---

### User Story 2 - Kullanıcı oturumu temiz şekilde kapatır (Priority: P2)

Giriş yapmış kullanıcı, üst bardaki "Çıkış" butonuna basarak oturumunu sonlandırır ve `/login` sayfasına döner. Çıkış sonrası tarayıcı geri tuşuyla `/dashboard`'a dönmeye çalışmak işe yaramaz; oturum gerçekten kapanmıştır.

**Why this priority**: Güvenlik ve kullanıcı kontrolü için zorunlu, ama P1 olmadan anlamı yok. Tek kullanıcılı sistemde "çıkış" çoğunlukla "ortak bilgisayardan ayrılıyorum" senaryosunda kullanılır.

**Independent Test**: Giriş yapmış bir oturumda üst bardaki "Çıkış" butonuna basılır; `/login`'e yönlendirildiği doğrulanır. Sonra tarayıcının geri tuşu denenir; korumalı içeriğin görünmediği, `/login`'e dönüş yapıldığı doğrulanır.

**Acceptance Scenarios**:

1. **Given** kullanıcı giriş yapmış ve herhangi bir korumalı sayfadadır, **When** üst bardaki "Çıkış" butonuna basar, **Then** sistem oturumu sonlandırır ve kullanıcıyı `/login` sayfasına yönlendirir.
2. **Given** kullanıcı az önce çıkış yapmıştır, **When** tarayıcı geri tuşuna basarak önceki korumalı sayfaya dönmeye çalışır, **Then** sistem cache'lenmiş korumalı içeriği göstermez; ya tekrar `/login`'e yönlendirir ya da boş/yeniden-doğrulama gerektiren bir durum sergiler.

---

### Edge Cases

- **Boş alan submit:** Email veya şifre alanı boş bırakılıp giriş denendiğinde tarayıcı içi form validation submit'i engeller ve ilgili alanın altında "Bu alan zorunludur" tarzı bir uyarı gösterir.
- **Geçersiz email formatı:** "abc" gibi email formatına uymayan girişlerde form validation hata gösterir, ağ isteği atılmaz.
- **Ağ kesintisi:** Login isteği sırasında ağ kopması olursa kullanıcı "Bağlantı sorunu. Lütfen tekrar deneyin." gibi generic bir mesaj görür; teknik detay (HTTP kodu, stack trace) gösterilmez.
- **Rate limit / brute-force koruması:** Aynı email'e birden fazla hatalı giriş denemesi yapıldığında auth sağlayıcısının kendi rate limiting'i devreye girer; sistem ek bir özel koruma uygulamaz.
- **İki sekmede aynı anda giriş:** Bir sekmede giriş yapıldığında diğer açık sekmede sayfa yenilenmese bile aynı oturum cookie'si paylaşılır; sonraki herhangi bir korumalı isteğinde oturum tanınır.
- **İki sekmede aynı anda çıkış:** Bir sekmede çıkış yapılırsa diğer sekme bir sonraki etkileşimde (sayfa yenileme, korumalı route'a tıklama) oturum kapalı bulur ve `/login`'e yönlendirilir.
- **Otomatik şifre yöneticisi (1Password, Chrome Password Manager):** Standart email ve password input alanları kullanıldığı için autofill çalışır, engellenmez.
- **Türkçe karakter içeren şifre:** Şifrede `ş, ç, ğ, ü, ö, ı` gibi karakterler varsa giriş çalışır; encoding sorunu olmamalıdır (UTF-8 her yerde).
- **Kullanıcı şifresini unutursa:** Ürün içi şifre sıfırlama yok (V1 kapsam dışı). Operasyonel çözüm: hesap sahibi auth sağlayıcısının yönetim paneline girip yeni şifre belirler.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistem `/login` adresinde public bir giriş sayfası sunmalıdır. Bu sayfa email ve şifre alanlarını + "Giriş Yap" butonunu içerir.
- **FR-002**: Sistem girilen email ve şifreyi auth sağlayıcısına göndererek kimlik doğrulamasını yapmalıdır.
- **FR-003**: Sistem hatalı giriş denemesinde generic bir hata mesajı ("Email veya şifre hatalı") göstermelidir; email'in sistemde kayıtlı olup olmadığını sızdırmamalıdır.
- **FR-004**: Başarılı girişten sonra sistem kullanıcıyı `/dashboard` adresine yönlendirmelidir.
- **FR-005**: `/dashboard` ve gelecekte eklenecek tüm korumalı route'lar geçerli bir oturum gerektirmelidir; oturumsuz istek `/login`'e yönlendirilmelidir.
- **FR-006**: Giriş yapmış kullanıcı `/login`'e gitmeye çalıştığında sistem onu `/dashboard`'a yönlendirmelidir.
- **FR-007**: Tüm korumalı sayfalarda görünen üst bar "Merhaba <kullanıcının email'i>" karşılamasını içermelidir.
- **FR-008**: Üst barda her zaman görünen bir "Çıkış" butonu bulunmalıdır.
- **FR-009**: "Çıkış" butonuna tıklandığında sistem oturumu sonlandırmalı, oturum cookie'sini geçersizleştirmeli ve kullanıcıyı `/login`'e yönlendirmelidir.
- **FR-010**: Çıkıştan sonra tarayıcı geri tuşuyla korumalı sayfaya dönülmeye çalışılırsa sistem cache'lenmiş içeriği sergilemeden tekrar oturum doğrulaması yapmalıdır (uygun no-cache header'lar veya yeniden istek).
- **FR-011**: Sistem oturum bilgisini auth sağlayıcısının varsayılan TTL'i kadar saklamalıdır; tarayıcı kapatılıp tekrar açıldığında oturum hâlâ açıksa kullanıcı doğrudan `/dashboard`'a düşmelidir.
- **FR-012**: `/` (kök) adresine yapılan istekler giriş yapılmamışsa `/login`'e, giriş yapılmışsa `/dashboard`'a yönlendirilmelidir (V1'de public marketing sayfası yok).
- **FR-013**: Sistem yeni kullanıcı kayıt akışı (sign-up) **sunmamalıdır**. Tek kullanıcı hesabı operasyonel olarak auth sağlayıcısının yönetim panelinden oluşturulur.
- **FR-014**: Sistem ürün içi şifre sıfırlama akışı **sunmamalıdır** (V1). Şifre kaybı durumu operasyonel kanalla çözülür.
- **FR-015**: Sistem 2FA, sosyal/OAuth login veya magic link akışları **sunmamalıdır** (V1).
- **FR-016**: Login formu submit'ten önce client-side validation yapmalıdır: email alanı boş olamaz ve email formatına uymalıdır; şifre alanı boş olamaz.
- **FR-017**: Login sayfası TR dilinde olmalıdır: "Email", "Şifre", "Giriş Yap", "Email veya şifre hatalı" gibi tüm metinler Türkçe. Türkçe karakterler (ı, İ, ş, ğ, ç, ö, ü) düzgün render olmalıdır.

### Key Entities *(include if feature involves data)*

- **User Account**: Auth sağlayıcısında tutulan kullanıcı kaydı. Görünür özellikler: email (giriş ve karşılama için), şifre (hash'li, asla okunmaz). V1'de tek bir kayıt mevcuttur; uygulama kendi içinde bu kaydın görsel-olmayan bir kopyasını tutmaz.
- **Session**: Auth sağlayıcısı tarafından üretilen, tarayıcı cookie'sinde taşınan kimlik kanıtı. Görünür özellikler: kullanıcı kimliği, geçerlilik süresi. Giriş yapıldığında oluşur, çıkışta veya TTL aşımında geçersizleşir.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Manuel oluşturulmuş hesabıyla ilk giriş yapan kullanıcı `/login`'e ulaştıktan dashboard'da karşılamayı görene kadar **30 saniyenin altında** tamamlar.
- **SC-002**: Hatalı email/şifre kombinasyonunda kullanıcı hata mesajını submit'ten sonra **1 saniyeden kısa sürede** görür.
- **SC-003**: Giriş yapılmamış halde `/dashboard` URL'ine 10 farklı denemede yapılan direkt erişimlerin **%100'ünde** kullanıcı `/login`'e yönlendirilir; korumalı içerik sızıntısı **sıfır** olmalıdır.
- **SC-004**: Çıkış butonuna basan kullanıcı **2 saniyenin altında** `/login` sayfasına ulaşır.
- **SC-005**: Çıkıştan sonra tarayıcı geri tuşuyla korumalı sayfaya geri dönmeye çalışıldığında **%100 oranında** korumalı içerik görünmez; sayfa ya `/login`'e yönlendirir ya da yeniden doğrulama gerektirir.
- **SC-006**: Bir kez giriş yapıldıktan sonra kullanıcı tarayıcıyı kapatıp **24 saat içinde** tekrar açtığında oturum hâlâ açık bulunur ve doğrudan `/dashboard`'a düşer (auth sağlayıcısı varsayılan TTL'i dahilinde).
- **SC-007**: Türkçe karakterler içeren email/şifre kombinasyonları (örn. `ı.kullanici@firma.com.tr`, şifrede `şçğüöı`) **%100 oranında** sorunsuz çalışır.

## Assumptions

- Tek kullanıcı senaryosu V1'de geçerlidir. İlk hesap operasyonel olarak auth sağlayıcısının yönetim panelinden oluşturulacak; otomatik email confirmation kullanılmayacak veya manuel onay verilecek.
- Auth sağlayıcısı varsayılan oturum TTL'i yeterli kabul edilir; bu spec özel bir TTL belirlemez.
- Şifre kaybı durumu için kurtarma yolu, hesap sahibinin auth sağlayıcısının yönetim paneline girip yeni şifre belirlemesidir; ürün içi kurtarma akışı yoktur.
- Uygulama dili Türkçe; tüm UI metinleri TR. Hata mesajları da TR.
- Hedef tarayıcılar: Chrome, Edge, Safari, Firefox (son 2 major sürüm). Mobil tarayıcı desteği opsiyonel ama responsive layout beklenir.
- Tek kullanıcılı olduğu için brute-force riski düşük; auth sağlayıcısının kendi rate limiting'inin ötesinde özel önlem alınmaz.
- "Beni hatırla" tarzı bir checkbox yoktur; oturum varsayılan TTL kuralına göre persist edilir.

## Out of Scope (V1)

- Ürün içi şifre sıfırlama akışı (forgot password)
- Yeni kullanıcı kayıt akışı (sign-up)
- İki faktörlü kimlik doğrulama (2FA)
- Sosyal/OAuth login (Google, GitHub, Apple, vb.)
- Magic link login (sonraki sürüm için planlı, V1'de yok)
- "Beni hatırla" / persistent login checkbox'ı
- Kullanıcı profil yönetimi (avatar, isim, ayarlar)
- Şifre değiştirme (ürün içi)
- Çoklu kullanıcı, rol, yetki sistemi
- Email değiştirme akışı
- Hesap silme akışı
