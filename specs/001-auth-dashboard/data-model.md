# Phase 1 — Data Model: Auth + Boş Dashboard İskeleti

**Date**: 2026-05-16

Bu feature uygulamanın `public` şemasında **yeni tablo açmaz**. Tüm auth verisi Supabase'in yönetilen `auth` şemasında durur. Aşağıdaki varlıklar referans amaçlıdır; bizim koddan yalnız okuma yapılır (yazma Supabase Auth API'si üzerinden).

---

## Entity 1: User (auth.users — Supabase-managed)

Auth sağlayıcısının kendi tablosu. Bizim uygulamamız bu tabloya **yazmaz**; sadece `supabase.auth.signInWithPassword` ile var olan kaydı doğrular ve `supabase.auth.getUser()` ile okur.

| Alan | Tip | Kaynak | Bizim kullanım |
|------|------|--------|----------------|
| `id` | UUID | Supabase auto | İleride sahiplik (örn. supplier_credentials.user_id) için foreign key — bu feature'da değil |
| `email` | text | Manuel oluşturma sırasında girilen | Login form input + üst bar karşılama ("Merhaba {email}") |
| `encrypted_password` | text | Supabase hash | **Okunmaz**, sadece `signInWithPassword` çağrısında karşılaştırma için |
| `email_confirmed_at` | timestamp | Manuel onay | V1 için Supabase Auth ayarlarında "auto-confirm" açılır (operasyonel) |
| `created_at` | timestamp | Supabase auto | — |
| `last_sign_in_at` | timestamp | Supabase auto | — |
| `user_metadata` | jsonb | Custom (boş kalır) | İleride `full_name` eklenirse karşılama buradan alınır; V1'de email fallback |

**Validasyon kuralları (bizim taraf):**
- Email: `z.string().email("Geçerli bir email adresi girin")`
- Şifre: `z.string().min(1, "Şifre boş bırakılamaz")` (uzunluk kuralı server tarafında Supabase'in default'una bağlı)

**State transitions:**
- _(yok — auth.users state'leri Supabase tarafından yönetilir)_

**RLS:**
- `auth.users` Supabase tarafından korumalı; bizim policy yazmamız gerekmiyor.
- İleride `public` şemasında kullanıcıya bağlı tablo açtığımızda, RLS policy `auth.uid() = user_id` pattern'ı ile yazılacak.

---

## Entity 2: Session (Supabase-managed, cookie-resident)

`supabase.auth.signInWithPassword` başarılı olduğunda üretilir; tarayıcı cookie'sinde taşınır; `supabase.auth.signOut` veya TTL aşımında geçersizleşir.

| Alan | Tip | Erişim | Bizim kullanım |
|------|------|--------|----------------|
| `access_token` | JWT | Cookie | Otomatik — `@supabase/ssr` cookie handler yönetir |
| `refresh_token` | string | Cookie | Otomatik — middleware her istekte refresh eder (`getUser()` tetikler) |
| `expires_at` | timestamp | Token içinde | `@supabase/ssr` TTL'i bilir, expire olunca refresh yapar |
| `user.id` | UUID | Token claim | Server Component'te `supabase.auth.getUser()` ile okunur |
| `user.email` | text | Token claim | Üst bar karşılaması |

**State transitions:**

```text
[None]
  │
  │  signInWithPassword(email, password) — başarılı
  ▼
[Active Session]
  │  ├─ Her korumalı request: middleware → updateSession() → getUser() çağrısı
  │  │  └─ Cookie taze ise: oturum doğrulanır, devam
  │  │  └─ Access token expire: refresh_token ile sessiz yenilenir
  │  │
  │  ├─ signOut() çağrısı
  │  │  ▼
  │  │  [None] — cookie temizlenir, /login'e redirect
  │  │
  │  └─ Refresh token geçersizleşir (TTL aşımı veya server tarafı invalidation)
  │     ▼
  │     [None] — bir sonraki request'te /login'e atılır
```

**RLS / güvenlik:**
- Session token'ları httpOnly cookie'de — JavaScript'ten okunamaz (`@supabase/ssr` default)
- `secure: true` production'da (HTTPS only)
- `sameSite: lax` — CSRF için makul default; auth form'larında Server Action zaten same-origin

---

## Veri akışı — özet diyagramı

```text
Browser                            Next.js Server                      Supabase Auth API
─────────                          ──────────────                      ──────────────────

POST /login          ───────►      Server Action: signIn(formData)
  (email, password)                  │
                                     │  zod safeParse                  
                                     │  (geçersizse form'a return)     
                                     │                                  
                                     ├─► createClient (server.ts)
                                     │   ├─► signInWithPassword       ───►  POST /auth/v1/token?grant_type=password
                                     │   │                                   ◄───  { access_token, refresh_token, user }
                                     │   └─► (success) cookie set
                                     │
                                     ├─► redirect(/dashboard)
                                     │
                          ◄─────────  302 + Set-Cookie

GET /dashboard       ───────►      middleware.ts → updateSession
                                     ├─► getUser() (cookie'den)        ───►  GET /auth/v1/user (Bearer token)
                                     │                                       ◄───  user veya 401
                                     │
                                     ├─► (user yok) redirect(/login)
                                     │
                                     ├─► (user var) devam → 
                                     │   app/(app)/layout.tsx render
                                     │   ├─► getUser() (cache'den)
                                     │   ├─► TopBar: "Merhaba {email}"
                                     │   └─► dashboard/page.tsx içerik
                                     │
                          ◄─────────  HTML + (refreshed) Set-Cookie

POST /logout         ───────►      Server Action: signOut()
  (LogoutButton)                     ├─► signOut()                     ───►  POST /auth/v1/logout
                                     │                                       ◄───  204 No Content
                                     ├─► cookie temizle
                                     ├─► redirect(/login)
                                     │
                          ◄─────────  302 + Set-Cookie (expired)
```
