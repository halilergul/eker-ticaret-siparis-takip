# Change Request Log

## Nasıl kullanılır
Her yeni talep veya kapsam değişikliği buraya kaydedilir.

## Format
```
### CR-NNN — Kısa başlık
- **Tarih:** YYYY-MM-DD
- **Talep eden:** kullanıcı / paydaş / kendi notum
- **Açıklama:** Ne isteniyor?
- **Etkilenen spec bölümleri:** spec.md satır X-Y
- **Etki analizi:** Kaç saatlik iş? Hangi modüller etkilenir?
- **Durum:** Beklemede / Onaylandı / Reddedildi / Tamamlandı
```

---

## Kayıtlar

### CR-001 — Feature 001-auth-dashboard tamamlandı
- **Tarih:** 2026-05-16
- **Talep eden:** Halil (kendi notu)
- **Açıklama:** Auth + boş dashboard iskeleti. Tek kullanıcı email+şifre ile giriş, `/dashboard` korumalı route, üst barda karşılama + çıkış butonu. Spec: [specs/001-auth-dashboard/spec.md](../specs/001-auth-dashboard/spec.md).
- **Etkilenen dosyalar:**
  - **Yeni:** `lib/routes.ts`, `lib/validations/auth.ts`, `app/(auth)/login/page.tsx`, `app/(auth)/login/actions.ts`, `app/(app)/layout.tsx`, `app/(app)/dashboard/page.tsx`, `components/features/auth/login-form.tsx`, `components/features/auth/logout-button.tsx`, `components/ui/top-bar.tsx`
  - **Değiştirilen:** `lib/supabase/middleware.ts` (route guard + Cache-Control no-store eklendi), `app/page.tsx` (sağlık kontrolünden koşullu redirect'e dönüştürüldü)
- **Etki analizi:** ~3 saat (spec + plan + research + tasks dahil), tek branch `001-auth-dashboard`, geri dönüş riski düşük. RLS politikası gerekmedi (yeni tablo yok).
- **Durum:** Tamamlandı. Manuel regression (QS-01 → QS-09) 2026-05-16'da kullanıcı tarafından geçirildi — tüm ✅.

### CR-002 — Feature 002-enderyapi-scraper-poc tamamlandı (kod)
- **Tarih:** 2026-05-16
- **Talep eden:** Halil (kendi notu)
- **Açıklama:** b2b.enderyapi.com.tr için Playwright tabanlı CLI scraper PoC. Spec: [specs/002-enderyapi-scraper-poc/spec.md](../specs/002-enderyapi-scraper-poc/spec.md).
- **Etkilenen dosyalar:**
  - **Yeni klasör/dosyalar:** `scripts/scrape/{constants,credentials,price-parse,output,errors,detection,enderyapi,README}.ts/md`
  - **Değiştirilen:** `package.json` (devDeps: playwright + tsx + dotenv; script: `scrape:enderyapi`), `.env.example` (ENDERYAPI_USERNAME, ENDERYAPI_PASSWORD), `.gitignore` (`scrape-debug/`)
- **Etki analizi:** ~4 saat (spec + plan + research + tasks + code). Next.js runtime'ına etkisi yok (scraper standalone). 3 bilinçli Constitution sapması (G2, G13, G14) plan.md → Complexity Tracking'te belgelendi; 004-005'te düzeltilecek.
- **Durum:** Tamamlandı (2026-05-16). **Senaryo A — feasibility kanıtlandı.** Login + navigation + parsing tüm üç adım çalışıyor; 20 sipariş başarıyla okundu. Site yapısı keşfedildi: SPA, iki-seviyeli (sipariş listesi → siparis-detay → ürün satırı), katalog 3. seviye. Implementation sırasında 4 küçük iterasyon yapıldı: (1) submit selector array genişletildi + Enter fallback, (2) 2FA detection sıkılaştırıldı (false positive fix), (3) SPA login için URL change wait, (4) detay sayfası için networkidle wait + verbose log. Site bulguları `dev-gotchas.md`'ye işlendi; 003'te Supabase schema'sı bu yapıya uygun (orders + order_items + products) tasarlanacak, 004'te tam scraper yazılacak.
