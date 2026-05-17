# Quickstart — Auth + Boş Dashboard İskeleti

**Date**: 2026-05-16
**Audience**: Geliştirici (smoke testing) + QA (acceptance kontrolü)

Bu doküman feature implement edildikten sonra **manuel olarak** çalıştırılacak test akışını tanımlar. Otomatik test infrastructure (Vitest + Playwright) bu feature'da kurulmuyor — auth akışı için manuel acceptance kontrolü yeterli kabul ediliyor.

---

## Ön hazırlık (bir kez yapılır)

### 1. Supabase Auth ayarları

Supabase Dashboard → Authentication → Providers → **Email**:
- **Enable Email provider:** açık
- **Confirm email:** **kapalı** (V1 tek kullanıcı, auto-confirm — operasyonel onay)
- Diğer provider'lar (Google, GitHub, vb.): **kapalı**

### 2. Tek kullanıcının manuel oluşturulması

Supabase Dashboard → Authentication → Users → "Add user" → "Create new user":
- **Email:** Eker Ticaret'te kullanılacak email (örn. `halil@eker.com.tr`)
- **Password:** Güçlü bir şifre — 1Password / keychain'e kaydet
- **Auto Confirm User:** ✅ açık

### 3. Geliştirme sunucusunu başlat

```bash
cd /Users/halilergul/Desktop/Projects/Eker-Ticaret
npm run dev
```

Tarayıcıda `http://localhost:3000`.

---

## QS-01 — Doğru bilgilerle giriş (US1, Acceptance 1)

1. Tarayıcıyı **incognito/private** modda aç (taze oturum)
2. `http://localhost:3000` adresine git
3. **Beklenen:** `http://localhost:3000/login` adresine yönlendirildin (FR-012, R-011)
4. Login form görünür: Email + Şifre input'ları + "Giriş Yap" butonu
5. Email alanına ön hazırlıkta oluşturulan kullanıcının email'ini gir
6. Şifre alanına doğru şifreyi gir
7. "Giriş Yap" butonuna tıkla
8. **Beklenen:**
   - 1 saniyenin altında yönlendirme olur (SC-002 dolaylı)
   - URL `/dashboard` oldu
   - Sayfanın üst kısmında bir bar var
   - Bar'da "Merhaba `<girilen email>`" yazıyor
   - Bar'da bir "Çıkış" butonu var
   - Sayfanın gövdesinde "Dashboard" başlığı veya placeholder içerik görünüyor

✅ Geçti / ❌ Kaldı: ____

---

## QS-02 — Giriş yapmadan /dashboard URL'ine direkt erişim (US1, Acceptance 2)

1. Tarayıcıyı **incognito** modda yeni bir pencere aç
2. Adres çubuğuna doğrudan `http://localhost:3000/dashboard` yaz, Enter
3. **Beklenen:**
   - `/login` adresine yönlendirildin
   - Korumalı sayfa içeriği (üst bar, dashboard) **hiç görünmedi** (flash yok)
   - URL bar `/login`'i gösteriyor

4. **Test 2b (alt path):** Adres çubuğuna `http://localhost:3000/dashboard/anything-else` yaz, Enter
5. **Beklenen:** Yine `/login`'e yönlendirildi (route group `(app)` altındaki her path korumalı)

✅ Geçti / ❌ Kaldı: ____

---

## QS-03 — Yanlış şifre, generic hata (US1, Acceptance 3)

1. Incognito → `/login`
2. Geçerli bir email gir (formata uygun, örn. `wrong@example.com`)
3. Şifre alanına yanlış bir şey gir (`abc123`)
4. "Giriş Yap"
5. **Beklenen:**
   - Yönlendirme olmaz, hâlâ `/login` sayfasındasın
   - 1 saniyenin altında hata mesajı görünür: **"Email veya şifre hatalı"** (SC-002)
   - Mesaj hangi alanın yanlış olduğunu (email var mı yok mu) söylemez

6. **Test 3b (kayıtlı email + yanlış şifre):** Ön hazırlıkta oluşturulan gerçek email + yanlış şifre
7. **Beklenen:** Aynı mesaj — "Email veya şifre hatalı". Email'in kayıtlı olduğu sızdırılmıyor (FR-003)

✅ Geçti / ❌ Kaldı: ____

---

## QS-04 — Giriş yapmış kullanıcı /login'e erişirse (US1, Acceptance 4)

1. Önce QS-01'i tamamla (oturum aç)
2. Aynı sekmede adres çubuğuna `http://localhost:3000/login` yaz, Enter
3. **Beklenen:**
   - `/dashboard`'a otomatik yönlendirildin
   - Login form'unu hiç görmedin (flash yok)

✅ Geçti / ❌ Kaldı: ____

---

## QS-05 — Çıkış akışı (US2, Acceptance 1)

1. Oturum açık halde `/dashboard`'dasın
2. Üst bardaki "Çıkış" butonuna tıkla
3. **Beklenen:**
   - 2 saniyenin altında `/login` sayfasına yönlendirildin (SC-004)
   - Üst bar artık görünmüyor (sadece login form)
   - Tarayıcı cookie'lerine bakarsan (DevTools → Application → Cookies → localhost) `sb-*-auth-token` cookie'leri boş/silinmiş

✅ Geçti / ❌ Kaldı: ____

---

## QS-06 — Çıkış sonrası geri tuşuyla cache sızıntısı kontrolü (US2, Acceptance 2)

1. QS-05'i tamamla (çıkış yapıldı, şu an `/login`'desin)
2. Tarayıcının geri (←) tuşuna bas
3. **Beklenen:**
   - Eski `/dashboard` sayfası cache'ten gösterilmedi (FR-010, R-007)
   - Ya doğrudan `/login`'e geri yönlendirildin
   - Ya da boş/yeniden-yükleniyor durumu sonrası `/login`'e düştün
   - **HİÇBİR durumda** "Merhaba {email}" başlığı veya korumalı içerik görünmedi

4. DevTools → Network sekmesini açarak tekrar dene; `/dashboard` isteğinin response header'larında `Cache-Control: no-store` (veya benzeri) görünüyor mu?

✅ Geçti / ❌ Kaldı: ____

---

## Ek smoke testler

### QS-07 — Form validation (Edge Cases)

1. `/login` aç
2. Email ve şifre alanlarını boş bırak, "Giriş Yap"
3. **Beklenen:** Tarayıcı/zod validation engelliyor, "Bu alan zorunludur" mesajı görünür
4. Email'e `abc` (geçersiz format), şifre dolu, submit
5. **Beklenen:** Email format hatası gösterilir, network isteği atılmaz

✅ Geçti / ❌ Kaldı: ____

### QS-08 — Türkçe karakter (SC-007)

1. Test kullanıcısı oluştururken email'de Türkçe karakter olmasa da şifrede dene
2. Supabase Dashboard'tan kullanıcının şifresini `şçğüöı123!` yap
3. `/login`'de bu şifreyle gir
4. **Beklenen:** Sorunsuz çalışır, hata yok (SC-007)

✅ Geçti / ❌ Kaldı: ____

### QS-09 — Oturum 24 saat persist (SC-006)

1. QS-01 sonrası tarayıcıyı tamamen kapat
2. (mümkün olduğunca 24 saat içinde) tarayıcıyı yeniden aç
3. `http://localhost:3000` veya `http://localhost:3000/dashboard` aç
4. **Beklenen:** Login istemeden doğrudan `/dashboard`'a düştün, oturum aktif

(Bu test 24 saat beklemek istemiyorsan: Network → cookie expiration'ı manuel olarak `expires_at`'ten önce olduğunu doğrula)

✅ Geçti / ❌ Kaldı: ____

---

## Implementer notları

- **Lokal Supabase Auth test ederken email confirmation kapalı olmalı.** Aksi takdirde her yeni kullanıcı için "doğrulama linki" emaili gönderilir ve manuel onay gerekir.
- **`sb-<project-ref>-auth-token` cookie'leri httpOnly** — `document.cookie` ile okunmuyor olmaları normaldir (G12 gate). DevTools → Application sekmesinden bakılır.
- **Production'da `secure: true`** otomatik gelir; `localhost` testinde `secure: false` olabilir (Supabase SSR akıllıca yönetiyor).
- Test sırasında `.env.local`'ın doğru `NEXT_PUBLIC_SUPABASE_*` değerlerini içerdiğine emin ol.

---

## Sonuç tablosu

| # | Test | Bağlı Acceptance | Sonuç |
|---|------|------------------|-------|
| QS-01 | Doğru giriş | US1.1 | _____ |
| QS-02 | /dashboard direkt erişim | US1.2 | _____ |
| QS-03 | Yanlış şifre generic mesaj | US1.3 | _____ |
| QS-04 | Login yapılmış /login | US1.4 | _____ |
| QS-05 | Çıkış akışı | US2.1 | _____ |
| QS-06 | Geri tuşu cache | US2.2 | _____ |
| QS-07 | Form validation | Edge | _____ |
| QS-08 | Türkçe karakter | SC-007 | _____ |
| QS-09 | 24h persist | SC-006 | _____ |

**Tamamen geçtiyse** feature acceptance criteria'yı karşılıyor demektir.
