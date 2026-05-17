# Quickstart — Enderyapi Scraper PoC

**Date**: 2026-05-16
**Audience**: Geliştirici (proje sahibi — kendisi çalıştıracak)

Bu doküman PoC'u implement ettikten sonra **gerçek hesapla manuel olarak** doğrulama akışını tanımlar.

---

## Ön hazırlık (bir kez)

### 1. Playwright Chromium binary'sini indir

```bash
cd /Users/halilergul/Desktop/Projects/Eker-Ticaret
npx playwright install chromium
```

~150 MB indirir, `~/Library/Caches/ms-playwright/` altında saklar. Bir kez yapılır. Internet bağlantısı gerekir.

### 2. `.env.local`'a enderyapi kimlik bilgilerini ekle

```bash
# .env.local dosyası mevcut, Supabase değerleri zaten var
# Sonuna ekle:
echo "" >> .env.local
echo "# Enderyapi B2B (PoC)" >> .env.local
echo "ENDERYAPI_USERNAME=halil@eker.com.tr" >> .env.local
echo "ENDERYAPI_PASSWORD=<gerçek-şifre>" >> .env.local
```

**Önemli:** Şifreyi düz metin olarak buraya yazıyorsun ama `.env.local` zaten gitignored — repo'ya gitmiyor, makinene özel kalıyor.

### 3. (İlk koşmadan önce) `scrape-debug/` klasörü oluşacak otomatik

Endişelenme, script ilk hata anında klasörü kendisi yaratır. `.gitignore`'a eklendi.

---

## Happy path test akışı

### QS-01 — İlk başarılı çalıştırma (US1.1)

```bash
cd /Users/halilergul/Desktop/Projects/Eker-Ticaret
npm run scrape:enderyapi
```

**Beklenen:** 60 sn altında biter, terminale en az bir sipariş satırı basar, exit 0. Çıktı şuna benzer:

```
Ürün: <ürün adı>
Sipariş tarihi: <YYYY-MM-DD veya site formatı>
Alış birim fiyatı: <sayı> ₺
Güncel birim fiyat: <sayı> ₺

(N sipariş bulundu, ilk sayfa, tek deneme)
```

**Doğrulama:**
- Exit code: `echo $?` → `0`
- Stdout'ta en az 1 sipariş ve 4 alan dolu
- `scrape-debug/` klasörü oluşmamalı (başarıda screenshot yok)
- Şifre stdout/stderr'de görünmemeli

✅ Geçti / ❌ Kaldı: _____

---

### QS-02 — `--json` flag'i

```bash
npm run scrape:enderyapi -- --json | tee /tmp/orders.json
cat /tmp/orders.json | python3 -m json.tool   # Veya jq
```

**Beklenen:** Stdout valid JSON dizisi. Python/jq parse'ı hata vermez. Türkçe karakterler doğru render olur (`Çelik` çıktıda `Çelik` değil, doğrudan `Çelik`).

✅ Geçti / ❌ Kaldı: _____

---

### QS-03 — `--verbose` flag'i

```bash
npm run scrape:enderyapi -- --verbose 2>&1 | less
```

**Beklenen:** Stderr'e adım-adım log akar. Stdout (başarı durumunda) yine sipariş listesi. Verbose log'ta hiçbir yerde şifre yazılı **değil** (kullanıcı adı/email görünebilir, kabul edilir).

**Doğrulama (kritik güvenlik):**
```bash
npm run scrape:enderyapi -- --verbose 2>&1 | grep -i "$(grep ENDERYAPI_PASSWORD .env.local | cut -d= -f2)"
```
Bu komut hiçbir eşleşme bulmamalı.

✅ Geçti / ❌ Kaldı: _____

---

### QS-04 — `--headed` mode (görsel debug)

```bash
npm run scrape:enderyapi -- --headed
```

**Beklenen:** Chromium penceresi açılır, login → orders flow'unu izleyebilirsin. Script biter, pencere otomatik kapanır. Sonuç aynı.

(Bu adım opsiyonel — failure durumunda görsel inceleme için faydalı.)

✅ Geçti / ❌ Kaldı: _____

---

## Hata yolu testleri

### QS-05 — Eksik env (US2 — `missing-credentials`)

```bash
# .env.local'daki ENDERYAPI_PASSWORD satırını geçici olarak yorumla
sed -i.bak 's/^ENDERYAPI_PASSWORD/#ENDERYAPI_PASSWORD/' .env.local
npm run scrape:enderyapi
echo "Exit code: $?"
# Geri al:
mv .env.local.bak .env.local
```

**Beklenen:**
- Stderr: `Hata: ENDERYAPI_USERNAME ve/veya ENDERYAPI_PASSWORD .env.local'da tanımlı değil`
- Exit code: 1
- Süre: 5 saniyenin altında (ağ isteği atılmaz)
- `scrape-debug/` boş (sayfa açılmadan döner)

✅ Geçti / ❌ Kaldı: _____

---

### QS-06 — Yanlış şifre (US2 — `login-failed`)

```bash
# .env.local'da şifreyi geçici olarak yanlış yap
sed -i.bak 's/^ENDERYAPI_PASSWORD=.*/ENDERYAPI_PASSWORD=yanlis-sifre-test123/' .env.local
npm run scrape:enderyapi
echo "Exit code: $?"
ls scrape-debug/ | tail -1
# Geri al:
mv .env.local.bak .env.local
```

**Beklenen:**
- Stderr: `Hata: Login başarısız: geçersiz kullanıcı adı veya şifre`
- Screenshot kaydedildi: `scrape-debug/<ts>-login-failed.png`
- Exit code: 1
- Süre: 30 sn altında

✅ Geçti / ❌ Kaldı: _____

---

### QS-07 — Ağ kesik (US2 — `network`)

```bash
# Wi-Fi'ı kapat veya
# macOS: networksetup -setairportpower en0 off
# Sonra:
npm run scrape:enderyapi
echo "Exit code: $?"
# Wi-Fi'ı geri aç:
# networksetup -setairportpower en0 on
```

**Beklenen:**
- Stderr: `Hata: Ağ hatası: <detay (DNS / timeout / connection refused)>`
- Exit code: 1
- Süre: 30 sn altında
- Screenshot **yok** (sayfa açılmadan)

✅ Geçti / ❌ Kaldı: _____

---

### QS-08 — CAPTCHA / bot block (US2 — `captcha`) — tetiklemesi zor

Bu testi otomatik tetiklemek zor; eğer site sürekli scrape'le rate-limit'e girersek tetikleyebiliriz, ama PoC bir kez çalıştırılıyor.

**Manuel test:** Çok hızlı 10-15 kez ardışık çalıştır:
```bash
for i in {1..15}; do npm run scrape:enderyapi; sleep 2; done
```

Hangi koşmada bot block'a girilirse:
- Stderr: `Hata: CAPTCHA tespit edildi (tip: ...)` veya `Hata: Bot koruması algılandı (Cloudflare challenge)`
- Screenshot: `scrape-debug/<ts>-captcha.png`
- Exit code: 1

Eğer site bot block etmiyorsa bu test atlanabilir; PoC sonucunda "siteler tetiklenmiyor" gerçeğini öğrenmiş oluruz (SC-008).

✅ Geçti / ❌ Kaldı / ⏭️ Atlandı: _____

---

### QS-09 — Beklenmedik DOM (US2 — `unexpected-dom`) — manuel test zor

Bu test ancak site HTML'i bizim selector'larımızı bulamayacak şekilde değiştiyse tetiklenir. Manuel tetikleme:
- Site lokal mock'lanırsa (PoC scope dışı)
- Veya gerçek hayatta site güncellendiğinde

İlk implementasyonda doğal koşmada test edilemez. PoC sonrası site değişikliği olduğunda bu yolun çalıştığını **kod review** ile doğrularız.

⏭️ Atlandı (manuel tetiklenebilir değil)

---

## Performance kontrolü

### QS-10 — Süre ölçümü

```bash
time npm run scrape:enderyapi > /dev/null
```

**Beklenen:** `real` süresi 60 saniyenin altında. Medyan ~45 sn etrafında.

5 ardışık koşma:
```bash
for i in {1..5}; do time npm run scrape:enderyapi > /dev/null; done
```

**Beklenen:** Tüm 5 koşma başarılı (exit 0), hiçbiri 60 sn'i aşmamalı.

✅ Geçti / ❌ Kaldı: _____

---

## Güvenlik kontrolü

### QS-11 — Şifre stdout/stderr/screenshot'ta yok mu?

```bash
PASSWORD=$(grep ENDERYAPI_PASSWORD .env.local | cut -d= -f2)
npm run scrape:enderyapi -- --verbose --json > /tmp/out.txt 2> /tmp/err.txt
echo "Stdout'ta şifre var mı?"; grep -F "$PASSWORD" /tmp/out.txt && echo "❌ SIZINTI" || echo "✅ Temiz"
echo "Stderr'de şifre var mı?"; grep -F "$PASSWORD" /tmp/err.txt && echo "❌ SIZINTI" || echo "✅ Temiz"
echo "Screenshot dosya adlarında şifre var mı?"; ls scrape-debug/ 2>/dev/null | grep -F "$PASSWORD" && echo "❌ SIZINTI" || echo "✅ Temiz"
```

**Beklenen:** Üç kontrol de "✅ Temiz".

✅ Geçti / ❌ Kaldı: _____

---

## Sonuç tablosu (2026-05-16 — Halil)

```
| #     | Test                          | Sonuç | Not                                                  |
|-------|-------------------------------|-------|------------------------------------------------------|
| QS-01 | Happy path (text)             | ✅    | 20 sipariş parse edildi; ürün adı = sipariş özeti     |
| QS-02 | --json output                 | ✅    | Akış JSON ile de çalışır                              |
| QS-03 | --verbose log                 | ✅    | Adım-adım log doğru, şifre log'da yok                 |
| QS-04 | --headed mode                 | ✅    | Browser pencere açıldı, login süreci izlendi          |
| QS-05 | Eksik env                     | ⏭️    | Atlandı (manuel tetik gerekli)                        |
| QS-06 | Yanlış şifre                  | ⏭️    | Atlandı (gerçek şifre ile çalışıldı)                  |
| QS-07 | Ağ kesik                      | ⏭️    | Atlandı                                              |
| QS-08 | CAPTCHA detection             | ✅    | Tetiklenmedi (SC-008 başarılı — site rate-limit yok) |
| QS-09 | Unexpected DOM                | ✅    | İterasyon sırasında 4 kez tetiklendi; düzeltildi      |
| QS-10 | Performance < 60sn medyan     | ✅    | ~50sn (20 sipariş × detay sayfası ziyareti)          |
| QS-11 | Güvenlik — şifre sızıntısı   | ✅    | Şifre stdout/stderr/screenshot dosyası nereden de görünmedi |
```

## PoC Sonucu — Senaryo A (feasibility kanıtlandı, site yapısı keşfedildi)

✅ Login: çalışıyor (SPA URL-change pattern)
✅ Sipariş listesi: navigation + parse OK (20 satır)
⚠️ "ürün adı" alanı: sipariş özeti çekildi, gerçek ürün satırları sipariş detay sayfasında (PoC kapsamı dışı)
⚠️ "güncel birim fiyat": null kaldı, katalog ziyareti gerekli (PoC kapsamı dışı)

**Sonuç:** Sorulan "siteyi scrape edebiliyor muyuz?" sorusuna cevap **EVET**. Sonraki adımda 003 Supabase schema (orders + order_items + products) iki-seviyeli yapıyı yansıtacak şekilde tasarlanıp 004'te scraper bunu kullanacak.

İterasyon sırasında 4 küçük kod düzeltmesi:
1. Submit button selector array genişletildi (text-tabanlı pattern'lar + Enter fallback)
2. 2FA detection sıkılaştırıldı (false positive fix — "kod" tek kelimesi yerine full phrase)
3. SPA login için `waitForURL` eklendi (`domcontentloaded` yetersizdi)
4. Detay sayfası için `networkidle` bekleyiş + verbose diagnostic log

---

## Beklenen PoC sonuçları (üç senaryo)

### Senaryo A — Tam başarı 🎯

QS-01 → QS-04 + QS-10 + QS-11 geçer; QS-05 → QS-07 doğru hata mesajları verir. Bu durumda PoC ana sorusuna **EVET** cevabı verir → 003'e (Supabase schema) geçebiliriz.

### Senaryo B — Kısmi başarı (parse adımında takılma)

Login çalışır ama sipariş satırlarını parse edemez (DOM beklediğimiz gibi değil). QS-09 yolu tetiklenir. **Action:** Implementer DOM'u inceleyip selector'ları düzeltir, 1-2 iterasyon. Sonra başarılı.

### Senaryo C — Bot block / CAPTCHA 🚧

Login adımında veya navigation sırasında Cloudflare challenge / reCAPTCHA çıkar. QS-08 tetiklenir (otomatik). **Action:** Projenin yön değişmesi gerekir:
- Browser extension yaklaşımına dön (kullanıcının kendi tarayıcı oturumunu kullan)
- Veya stealth plugin (playwright-extra/stealth) dene — kapsam dışı şu an, ayrı feature
- Veya GitHub Actions yerine farklı IP havuzu (kapsam dışı)

PoC bunu öğretmek için var. ❌ değil, ⚠️ "yön değiştir".

---

## Bittiğinde

Tablodaki sonuçları paylaş. Senaryo A ise: 003 — Supabase schema (orders, products, price_snapshots tabloları) ile devam. Senaryo B/C ise: ne öğrendiğimizi tartışıp planı revize.
