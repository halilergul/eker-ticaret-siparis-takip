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
