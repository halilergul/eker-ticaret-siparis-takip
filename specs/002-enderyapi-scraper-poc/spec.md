# Feature Specification: Enderyapi Scraper PoC

**Feature Branch**: `002-enderyapi-scraper-poc`

**Created**: 2026-05-16

**Status**: Draft

**Input**: User description: "Enderyapi scraper PoC. b2b.enderyapi.com.tr sitesine Playwright ile login olup sipariş geçmişi sayfasını parse eden bir CLI script'i. Çalıştırılma şekli: `npm run scrape:enderyapi`. Credentials (kullanıcı adı + şifre) .env.local'dan okunur (ENDERYAPI_USERNAME, ENDERYAPI_PASSWORD). Script en az bir tane sipariş kaydını çıktıda gösterir: ürün adı, sipariş tarihi, alış birim fiyatı + güncel birim fiyat. JSON ya da düz metin formatında stdout. Bot koruması / CAPTCHA / 2FA varsa script açık bir hata mesajıyla durur. Kapsam dışı: Supabase'e yazma, dashboard değişikliği, GitHub Actions schedule, çoklu site adapter mimarisi, fiyat karşılaştırma logic'i. Bu PoC sadece 'siteyi gerçekten scrape edebiliyor muyuz?' sorusunu cevaplar."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Geliştirici scraping fizibilitesini terminal çıktısıyla doğrular (Priority: P1) 🎯 MVP

Geliştirici (proje sahibi) `npm run scrape:enderyapi` komutunu çalıştırır. Script .env.local'dan b2b.enderyapi.com.tr kimlik bilgilerini okur, headless Chromium ile siteye giriş yapar, sipariş geçmişi sayfasına ulaşır, sayfadaki en az bir sipariş kaydını parse eder ve terminale **ürün adı + sipariş tarihi + alış birim fiyatı + güncel birim fiyat** dört alanı dolu olacak şekilde basar. 60 saniyenin altında biter ve exit code 0 ile çıkar.

**Why this priority**: Tüm projenin "evet/hayır" sorusunu cevaplar. Bu çalışmazsa fiyat takip dashboard'u kavramı baştan revize edilir (browser extension, manuel veri girişi, vb. yollara dönülür). Çalışırsa sonraki feature'lar (Supabase schema, schedule, dashboard liste) güvenle planlanır.

**Independent Test**: Test kullanıcısı `.env.local`'a kendi enderyapi kullanıcı adı + şifresini ekler, `npm run scrape:enderyapi` çalıştırır. Terminal çıktısında en az bir satır şu formatta görmelidir:
```
Ürün: <ürün adı>
Sipariş tarihi: <YYYY-MM-DD veya site formatı>
Alış birim fiyatı: <sayı> ₺
Güncel birim fiyat: <sayı> ₺
```
Tüm dört alan dolu (boş/null değil). Script `exit 0` ile döner.

**Acceptance Scenarios**:

1. **Given** `.env.local`'da geçerli `ENDERYAPI_USERNAME` ve `ENDERYAPI_PASSWORD` var, **When** geliştirici `npm run scrape:enderyapi` çalıştırır, **Then** script 60 saniyenin altında biter, stdout'a en az bir tam sipariş kaydı (4 alan dolu) yazar ve exit code 0 ile çıkar.
2. **Given** sipariş geçmişinde birden fazla ürün var, **When** script çalışır, **Then** script ilk sayfadaki tüm görünür siparişleri parse eder ve sırayla stdout'a yazar (her biri 4 alan dolu).
3. **Given** geliştirici `--json` flag'i ile çalıştırır (örn. `npm run scrape:enderyapi -- --json`), **When** script biter, **Then** stdout'taki çıktı parse edilebilir bir JSON dizisidir: `[{ "product_name": "...", "order_date": "...", "purchase_unit_price": <sayı>, "current_unit_price": <sayı>, "currency": "TRY" }, ...]`.

---

### User Story 2 - Hata durumlarında geliştirici tam olarak ne olduğunu anlar (Priority: P2)

Script herhangi bir nedenle başarısız olduğunda (yanlış kimlik, CAPTCHA, bot koruması, 2FA, ağ kesintisi, beklenmedik DOM yapısı), terminale **hangi failure mode'unun tetiklendiğini açıkça söyleyen** bir mesaj basar ve sorunlu sayfanın ekran görüntüsünü `scrape-debug/<timestamp>.png` olarak kaydeder. Exit code 1 ile çıkar.

**Why this priority**: PoC'un asıl değeri "evet/hayır"ın ötesinde "neden hayır" bilgisidir. Bot koruması varsa adapter mimarisi değişir; 2FA varsa yaklaşımı baştan kurarız; ağ hatası ise sadece retry mantığı eklenir. Belirsiz "hata oluştu" mesajı PoC'u faydasız kılar. P2, çünkü P1 olmadan zaten anlamsız.

**Independent Test**: Her hata senaryosu için tetikleme + doğrulama:
- Yanlış şifre → "Login başarısız: geçersiz kullanıcı adı veya şifre" + screenshot
- Ağ kesik (örn. `wifi off`) → "Ağ hatası: siteye ulaşılamadı (timeout/connection refused)"
- Site CAPTCHA gösterirse → "CAPTCHA tespit edildi (manuel müdahale gerekiyor)" + screenshot
- Site 2FA isterse → "2FA gerekli — PoC kapsam dışı, manuel auth gerekli" + screenshot
- DOM beklediğimiz selector'ı bulamazsa → "Sayfa yapısı değişmiş veya beklenmedik durum: [hangi adımda]" + screenshot

**Acceptance Scenarios**:

1. **Given** `.env.local`'da geçersiz şifre var, **When** script çalışır, **Then** stderr'e "Login başarısız: geçersiz kullanıcı adı veya şifre" yazar, `scrape-debug/<timestamp>.png` oluşturur ve exit code 1 ile çıkar.
2. **Given** site CAPTCHA gösteriyor, **When** script bunu algılar, **Then** stderr'e "CAPTCHA tespit edildi (manuel müdahale gerekiyor)" yazar, screenshot kaydeder ve exit code 1 ile çıkar.
3. **Given** ağ bağlantısı yok veya site cevap vermiyor, **When** script 30 saniye timeout'a ulaşır, **Then** stderr'e "Ağ hatası: siteye ulaşılamadı" + spesifik error detail yazar ve exit code 1 ile çıkar.
4. **Given** sayfanın HTML yapısı beklediğimiz selector'larla uyumsuz, **When** parse aşamasında selector bulunamaz, **Then** stderr'e "Sayfa yapısı değişmiş: [hangi adımda — login form / sipariş listesi / ürün satırı]" yazar, screenshot kaydeder ve exit code 1 ile çıkar.

---

### Edge Cases

- **Boş sipariş geçmişi:** Hesabın hiç siparişi yoksa script "Sipariş geçmişi boş" warning'i basar, `exit 0` ile çıkar (failure değil, sadece veri yok).
- **Cookie consent banner / KVKK popup'ı:** İlk ziyarette bir onay banner'ı çıkarsa script bunu otomatik dismiss eder veya etrafından dolaşır; aksi takdirde "Beklenmedik popup: cookie/KVKK onayı" mesajıyla durur.
- **Şifrede Türkçe karakter:** `şçğüöı` içeren şifreler sorunsuz iletilir (Playwright fill() UTF-8 default).
- **Ürün artık satışta değil (delisted):** Sipariş geçmişinde göründüğü halde ürün sayfası 404 veya "kaldırıldı" gösterirse, `current_unit_price` alanı için `null` yazılır ve "ürün artık listede değil" notu eklenir; script crash etmez, diğer siparişlere devam eder.
- **TR locale fiyat formatı (1.234,56 ₺):** Script bu formatı parse edip sayıya çevirir; nokta = binlik, virgül = ondalık.
- **Long-running parse sırasında oturum zaman aşımı:** Eğer parse 60 sn'den uzun sürer ve oturum düşerse, script "Oturum zaman aşımı" mesajıyla durur; otomatik re-login PoC kapsam dışı.
- **Headless detection:** Bazı siteler Playwright'ı algılayıp bloklayabilir; algılanırsa US2'deki "bot koruması" hata yoluna düşer. Çözüm (stealth plugin, headed mode, vb.) bu spec'te yok — PoC sonucu olarak öğreneceğiz.
- **Birden fazla sipariş sayfası:** PoC sadece **ilk sayfayı** parse eder; pagination kapsam dışı. Sayfa sayısı görünüyorsa stdout'a "Toplam X sayfa, sadece ilk sayfa okundu" notu basılır.
- **Site fiyatı stokta olmadığında göstermez:** "Stok yok" durumu için fiyat alanı boş veya gizli olabilir → `current_unit_price = null` + not.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Script `npm run scrape:enderyapi` komutuyla tetiklenmelidir. `package.json` scripts bölümüne kayıt eklenir.
- **FR-002**: Script kimlik bilgilerini `.env.local`'dan iki env var ile okumalıdır: `ENDERYAPI_USERNAME`, `ENDERYAPI_PASSWORD`. Bu değerler **asla** stdout/stderr'e basılmaz, **asla** screenshot dosya isminde geçmez.
- **FR-003**: İki env var'dan en az biri boşsa script "ENDERYAPI_USERNAME ve/veya ENDERYAPI_PASSWORD .env.local'da tanımlı değil" mesajıyla `exit 1` yapmalıdır. Ağ isteği atılmamalıdır.
- **FR-004**: Script bir tarayıcı otomasyonu aracıyla çalışmalıdır (varsayılan: headless Chromium). İsteğe bağlı `--headed` flag'i ile görsel debug mümkün olmalıdır.
- **FR-005**: Script b2b.enderyapi.com.tr login sayfasına gider, kimlik bilgilerini girip submit eder.
- **FR-006**: Başarılı login sonrası script sipariş geçmişi / "Siparişlerim" sayfasına navigate eder.
- **FR-007**: Script sipariş geçmişi sayfasının **ilk sayfasındaki** en az bir sipariş satırını parse etmelidir. Her satır için şu dört alan toplanır: `product_name`, `order_date`, `purchase_unit_price`, `current_unit_price`.
- **FR-008**: Güncel birim fiyat (`current_unit_price`) için script gerekirse ürün detay sayfasını ayrıca ziyaret edebilir (sipariş satırında yalnız alış fiyatı görünüyorsa). Bu navigation şeffaftır.
- **FR-009**: Çıktı varsayılan olarak insan-okunabilir düz metin (her sipariş için 4 satır, satırlar arası boş satırla ayrılmış) stdout'a yazılır.
- **FR-010**: Script `--json` (veya `-j`) flag'i ile çağrılırsa çıktı tek bir JSON dizisi olarak stdout'a yazılır. Türkçe karakterler escape edilmez (`ensure_ascii=false` muadili).
- **FR-011**: Script başarılı tamamlandığında `exit 0` ile çıkmalıdır. Herhangi bir hata durumunda `exit 1` (veya farklı non-zero) kullanılmalıdır.
- **FR-012**: Hata durumlarında mesaj **stderr**'e (stdout'a değil) yazılmalıdır. Mesaj failure mode'unu açıkça söylemelidir (örn. "Login başarısız: …", "CAPTCHA tespit edildi", "Ağ hatası: …", "Sayfa yapısı değişmiş: <hangi adım>").
- **FR-013**: Hata anında script aktif tarayıcı sayfasının ekran görüntüsünü `scrape-debug/<ISO-timestamp>.png` olarak kaydetmelidir. Klasör yoksa otomatik oluşturulur. Bu klasör `.gitignore`'a eklenir (geçici debug çıktısı).
- **FR-014**: Script bot koruması / CAPTCHA göstergelerini (Cloudflare challenge sayfası, reCAPTCHA iframe, hCaptcha, "Are you human" mesajı, vb.) algılamak için sayfa içeriğini kontrol etmelidir. Tespit edilirse FR-012'deki kanal ile "CAPTCHA / bot koruması algılandı" mesajı vermelidir.
- **FR-015**: Script 2FA prompt'u algılarsa (SMS kodu, OTP, authenticator uygulaması alanı) "2FA gerekli — PoC kapsam dışı" mesajıyla durmalıdır.
- **FR-016**: Script toplam çalışma süresi 60 saniyeyi geçtiyse kendisini durdurmalı ve "İşlem zaman aşımı (60sn)" mesajıyla `exit 1` yapmalıdır.
- **FR-017**: Script `--verbose` flag'i ile detaylı log üretebilmelidir (hangi sayfada hangi adım çalışıyor). Default mode'da sadece sonuç + hata mesajı görünmelidir.
- **FR-018**: Script **hiçbir veriyi** Supabase'e, lokal dosyalara (screenshot dışında), `.env*` dosyalarına yazmamalıdır. Sadece stdout/stderr ve `scrape-debug/`.
- **FR-019**: Script kimlik bilgilerini hiçbir log mesajında, ekran görüntüsü dosya adında veya hata stack trace'inde göstermemelidir (şifre maskeleme veya hiç bahsetmeme).
- **FR-020**: TR locale fiyat formatı (örn. `1.234,56 ₺`, `12,50 TL`, `1.250,00`) numeric değere çevrilmelidir. Çıktıda fiyatlar floating point sayı + `currency: "TRY"` alanı olarak normalize edilir.
- **FR-021**: Ürün satırı parse edilirken beklenen DOM selector bulunamazsa script "Sayfa yapısı değişmiş: [hangi adım]" mesajıyla `exit 1` yapmalıdır (sessiz başarısızlık yok).

### Key Entities *(include if feature involves data)*

- **OrderLine** (yalnızca in-memory, persist edilmez): Bir sipariş satırını temsil eder.
  - `product_name`: string — ürün adı
  - `order_date`: string (ISO 8601 veya site formatı, parse edilebilir)
  - `purchase_unit_price`: number — kullanıcının ödediği birim fiyat (TL)
  - `current_unit_price`: number | null — sitedeki şu anki birim fiyat (delisted ürün için null)
  - `currency`: string — "TRY" (sabit, çoklu currency desteği yok)
  - `notes` (opsiyonel): string — "ürün artık listede değil", "stokta yok" gibi açıklamalar

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Doğru kimlik bilgileri ile **5 ardışık denemede %100 oranında** script başarıyla çıkış yapıp en az 1 OrderLine basar (flaky failure ≤ %0).
- **SC-002**: Happy path çalışma süresi medyan **45 saniyenin altında**, p95 60 saniyenin altında.
- **SC-003**: Yanlış kimlik bilgileri ile çalışmada **30 saniyenin altında** "Login başarısız" mesajı ile exit 1 olunur.
- **SC-004**: Network'ün down olduğu durumda (örn. dns failure) script **30 saniye içinde** "Ağ hatası" mesajıyla durur.
- **SC-005**: Tüm hata yollarında (FR-012-FR-015, FR-021) stderr çıktısında **failure mode'u tanımlayan spesifik bir anahtar kelime** bulunur ("Login", "CAPTCHA", "2FA", "Ağ", "Sayfa yapısı", "Timeout") — kullanıcı çıktıyı okuyup ne yapması gerektiğini 10 saniyede anlayabilmelidir.
- **SC-006**: Script çalışmasının hiçbir noktasında kullanıcı adı veya şifre stdout/stderr/screenshot dosya adında **görünmemelidir** (manuel inceleme ile doğrulanır).
- **SC-007**: Türkçe karakter içeren ürün adları (örn. `Çelik İnşaat Demiri Ø12`) **%100 oranında** doğru encoding ile basılır (kırık karakter, mojibake yok).
- **SC-008**: 5 ardışık happy-path çalıştırmasında site bot block veya rate-limit tetiklemez (saatte 5 deneme tipik geliştirici tempo).

## Assumptions

- Geliştiricinin kendi b2b.enderyapi.com.tr şirket hesabı vardır; kullanıcı adı ve şifre bilgisi mevcuttur ve aktif kullanılabilir durumdadır.
- Site standart form-tabanlı login sunar (kullanıcı adı/email + şifre). Eğer OAuth, SSO, sosyal login veya magic-link only ise bu PoC yeniden tasarlanmalıdır (assumption ihlali; PoC sonucu olarak çıkar).
- Sipariş geçmişi sayfası login sonrası ulaşılabilir bir sayfadır (örn. `/account/orders`, `/siparislerim` gibi bir URL). Tam URL ilk denemede script tarafından keşfedilecek (link takip veya bilinen URL pattern).
- Sipariş satırlarında veya ürün detay sayfasında birim fiyat görünür.
- Fiyatlar TL cinsinden; çoklu currency yok.
- Site Türkiye'den erişilebilir (geo-block yok).
- Script geliştiricinin yerel makinesinden (ev IP'si veya çalışma yeri IP'si) çalıştırılır; production sunucudan değil. GitHub Actions runner'dan çalıştırma sonraki feature'da test edilir, bu spec dışı.
- Sayfada cookie/KVKK consent banner'ı varsa script bunu dismiss edebilir veya bu banner login akışını engellemez.
- Site oturum süresi en az 5 dakika; script tek bir çağrıda işini bitirir.

## Out of Scope (V1)

- **Veri kalıcılığı:** Supabase, dosya, başka herhangi bir store'a yazma yok.
- **Dashboard / UI:** Bu feature hiçbir UI değişikliği yapmaz; yalnız CLI script.
- **Otomatik schedule:** GitHub Actions cron, sistem cron, Vercel Cron — hepsi sonraki feature(lar).
- **Çoklu site adapter mimarisi:** Bu PoC sadece enderyapi'ye özel; "adapter interface" yok, abstract base class yok.
- **Fiyat karşılaştırma / zam tespit logic'i:** Sadece veri okuma. "Şu ürün zamlanmış mı" hesabı sonraki feature.
- **Pagination:** İlk sayfayı geçen sipariş geçmişi okunmaz.
- **Geçmişe dönük tam sipariş indirme:** Sadece şu an görünenler.
- **CAPTCHA çözme / bypass:** Algılarsa durur. Çözmeye çalışmaz.
- **2FA otomasyonu:** SMS okuma, TOTP generator, Authenticator entegrasyonu yok.
- **Stealth / anti-detection plugin'ler:** Playwright vanilla. Bot algılanırsa öğreneceğiz, çözmek bir sonraki adım.
- **Proxy / VPN rotation:** Yok.
- **Birden fazla hesap:** Tek `.env.local` set, tek hesap.
- **Bildirim / alert:** Script bittiğinde Slack/email/push yok. Sadece stdout/stderr.
- **Yeniden deneme (retry) logic:** Network hatasında otomatik retry yok; tek deneme, fail-fast.
- **Concurrency / paralellik:** Tek browser instance, sequential parse.
