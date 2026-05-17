# Contracts — Auth Server Actions

**Date**: 2026-05-16

Bu feature dış REST API açmaz; "contract" yüzeyi Server Action fonksiyonlarıdır. Bu doküman fonksiyonların input/output şemasını, hata kodlarını ve davranışını tanımlar. Implementation bu kontratlara uyacak.

---

## Action: `signIn(formData: FormData)`

**Konum**: `app/(auth)/login/actions.ts`

**Direktif**: `"use server"` (file-level)

**Erişim**: Public (kimlik doğrulanmamış kullanıcı çağırır)

### Input

`FormData` ile gelen field'lar:

| Field | Tip | Zorunlu | Kısıt |
|-------|------|---------|-------|
| `email` | string | ✅ | RFC 5321 email format |
| `password` | string | ✅ | min 1 karakter (Supabase tarafı default min 6) |

`lib/validations/auth.ts` içindeki zod schema:

```ts
export const loginSchema = z.object({
  email: z.string().email("Geçerli bir email adresi girin"),
  password: z.string().min(1, "Şifre boş bırakılamaz"),
});
export type LoginInput = z.infer<typeof loginSchema>;
```

### Output

Server Action iki uçlu davranır:

**Başarı:**
- Cookie set edilir (`@supabase/ssr` üzerinden)
- `redirect(ROUTES.DASHBOARD)` — Next.js redirect (throw eder, function return etmez)

**Hata:**
- Function `{ error: string }` döner; form bunu görüntüler
- Hiçbir durumda kullanıcıya stack trace, HTTP code, veya Supabase iç hata mesajı sızdırılmaz

### Hata kodları (kullanıcıya gösterilen mesajlar)

| İç durum | Kullanıcıya gösterilen | HTTP davranışı |
|----------|------------------------|----------------|
| Geçersiz email format / boş alan | Form field altında ilgili zod mesajı | 200 (form re-render) |
| Yanlış email + şifre kombinasyonu | "Email veya şifre hatalı" | 200 (form re-render) |
| Supabase Auth rate limit | "Çok fazla deneme yapıldı, lütfen biraz sonra tekrar deneyin" | 200 |
| Ağ / sunucu hatası (5xx, network) | "Bağlantı sorunu. Lütfen tekrar deneyin." | 200 |
| Beklenmedik hata | "Bir hata oluştu. Lütfen tekrar deneyin." (+ server-side log) | 200 |

**Önemli güvenlik:** Email kayıtlı değilse de "Email veya şifre hatalı" gösterilir — email enumeration sızıntısı yok (FR-003).

### Davranış akışı

```text
1. formData → loginSchema.safeParse
   ├─ Başarısız → return { error: zod ilk hata mesajı }
   └─ Başarılı → 2
2. createClient (server.ts) → supabase.auth.signInWithPassword({ email, password })
   ├─ error → eşleme tablosu → return { error: <kullanıcı mesajı> }
   └─ success → 3
3. revalidatePath('/', 'layout') (oturumlu UI yeniden render)
4. redirect(ROUTES.DASHBOARD)  // throw — fonksiyon burada biter
```

### Yan etkiler

- `auth.users.last_sign_in_at` Supabase tarafından güncellenir
- Tarayıcıya `sb-<project-ref>-auth-token` cookie'leri set edilir (httpOnly + secure + sameSite=lax)
- `revalidatePath('/', 'layout')` ile Next.js cache'i temizlenir

---

## Action: `signOut()`

**Konum**: `app/(auth)/login/actions.ts` (veya ayrı dosya — implementer tercihi)

**Direktif**: `"use server"` (file-level)

**Erişim**: Authenticated (sadece giriş yapmış kullanıcı tetikler; ama imzaca herkesin çağırabileceği bir Server Action — bu sorun değil, signOut idempotent)

### Input

Yok (`FormData` argümanı opsiyonel, kullanılmaz).

### Output

- Cookie temizlenir
- `redirect(ROUTES.LOGIN)` — throw eder

### Hata kodları

| İç durum | Kullanıcıya gösterilen | Davranış |
|----------|------------------------|----------|
| Supabase signOut hatası | _(hata sessiz log'a yazılır, cookie zaten temizlenir, redirect yapılır)_ | redirect(/login) |
| Ağ hatası | _(aynı — local cookie temizliği yeterli)_ | redirect(/login) |

**Tasarım kararı:** signOut'ta hata kullanıcıya gösterilmez. Pratikte cookie'ler client tarafında ya da en azından server response'la silinir, kullanıcı /login'e atılır. "Çıkış başarısız" mesajı kullanıcıyı korumalı sayfada bırakırsa daha kötü.

### Davranış akışı

```text
1. createClient (server.ts) → supabase.auth.signOut()
   └─ try/catch — hata olsa bile cookie temizleme garanti
2. revalidatePath('/', 'layout')
3. redirect(ROUTES.LOGIN)  // throw
```

### Yan etkiler

- Supabase tarafında refresh token invalidate edilir (server signOut yapılırsa)
- Auth cookie'leri silinir (`Max-Age=0`)
- `revalidatePath('/', 'layout')` ile Next.js cache temizlenir

---

## Middleware contract (genişletilmiş `updateSession`)

**Konum**: `lib/supabase/middleware.ts`

Mevcut `updateSession` sadece session refresh yapıyor. Genişletilmiş davranış:

### Input

`NextRequest` — istek path'i `request.nextUrl.pathname`.

### Output

`NextResponse` — ya `NextResponse.next()` (devam) ya `NextResponse.redirect(url)` (yönlendirme).

### Davranış matrisi

| Path örüntüsü | Auth durumu | Davranış |
|---------------|-------------|----------|
| `/login` | Oturum **yok** | Devam — login form'unu göster |
| `/login` | Oturum **var** | `redirect(/dashboard)` |
| `/dashboard` (ve alt path'ler) | Oturum **var** | Devam — sayfayı render et |
| `/dashboard` (ve alt path'ler) | Oturum **yok** | `redirect(/login)` |
| `/` | Oturum **var** | `redirect(/dashboard)` |
| `/` | Oturum **yok** | `redirect(/login)` |
| `/_next/*`, statik dosyalar | (matcher dışı) | Middleware çalışmaz |

### No-cache header (korumalı path'lerde)

`/dashboard` ve alt path'leri için response'a:
```
Cache-Control: no-store, no-cache, must-revalidate
```
ekle. (FR-010 → çıkış sonrası geri tuşu cache sızıntısını engeller.)

---

## Test contract (acceptance scenarios → implementation kontrolü)

Spec'teki her acceptance scenario için `quickstart.md`'de manuel test adımı tanımlı. Bu kontrat dosyası, _her contract'ın test edilebilir olduğunu_ garantiler:

| Acceptance | Contract | Quickstart adımı |
|------------|----------|------------------|
| US1.1 (Doğru giriş → /dashboard) | `signIn` başarı yolu | QS-01 |
| US1.2 (Direkt /dashboard erişim → /login) | Middleware redirect | QS-02 |
| US1.3 (Yanlış şifre → generic mesaj) | `signIn` hata yolu | QS-03 |
| US1.4 (Giriş yapmış /login → /dashboard) | Middleware redirect | QS-04 |
| US2.1 (Çıkış butonu → /login) | `signOut` başarı | QS-05 |
| US2.2 (Geri tuşu → korumalı içerik gizli) | No-cache header + middleware | QS-06 |
