# Phase 0 — Research: Auth + Boş Dashboard İskeleti

**Date**: 2026-05-16
**Status**: Complete (no `[NEEDS CLARIFICATION]` markers in spec)

Spec'te netleşmemiş madde yoktu. Bu doküman planlama sırasında karar verilen teknik seçimleri Decision / Rationale / Alternatives Considered formatında belgeler.

---

## R-001 — Route guard'ın katmanı: middleware mı, layout mı, yoksa her ikisi mi?

**Decision**: Her ikisi (defense-in-depth).
1. `middleware.ts` (mevcut) → `(app)` route group'una giren her isteği auth açısından kontrol eder; oturum yoksa `/login`'e yönlendirir, varsa devam.
2. `app/(app)/layout.tsx` Server Component → kendisi de `await supabase.auth.getUser()` çağırır; null dönerse `redirect('/login')`. Middleware başarısız olsa bile sızıntı olmaz.

**Rationale**:
- Middleware tek başına: yeterli performans, ama bir gün regex/matcher hatasıyla route atlanabilir (sessiz başarısızlık)
- Layout tek başına: tüm Server Component request başına auth call yapar (her zaman zaten yapacak, çünkü `getUser()` cookie refresh için gerekli)
- İkisi birden: ekstra cost 0 (aynı getUser() çağrısı zaten oluyor), güvenlik garantisi katmanlı. FR-005'i tam karşılar.

**Alternatives considered**:
- Sadece middleware: Hızlı ama tek nokta arıza. Reddedildi.
- Sadece layout: Middleware'ın session refresh'i kaybolur, login sonrası cookie güncelleme sorunlu. Reddedildi.
- Client-side redirect (`useEffect` içinde): Sayfa flash eder, SSR avantajı kaybolur, güvenlik açısından kötü. Reddedildi.

---

## R-002 — Login: Server Action mı, Route Handler (`/api/auth/login`) mı, yoksa client-side `supabase.auth.signInWithPassword` mı?

**Decision**: Server Action (`app/(auth)/login/actions.ts` → `signIn(formData)`).

**Rationale**:
- Server Action: Cookie'ler Next.js'in `cookies()` API'siyle server-side set edilir; `@supabase/ssr`'ın server.ts pattern'ıyla birebir uyumlu. Form `<form action={signIn}>` ile çalışır, JS olmadan da düşük dereceli çalışır (progressive enhancement).
- Route Handler: Daha eski pattern, FormData'yı manuel parse etmek + redirect tetiklemek + revalidatePath gibi şeyler daha verbose.
- Client-side signInWithPassword: Cookie session'ı tarayıcıdan set olur ama SSR Server Component'lerin ilk render'ında oturum görünmez (race condition), middleware refresh'i karmaşıklaşır. Resmi `@supabase/ssr` dokümanı server-side login'i öneriyor.

**Alternatives considered**:
- Route Handler `/api/login`: Reddedildi — Server Action'a göre boilerplate fazla.
- Client-side: Reddedildi — SSR ile uyumsuz, hydration race var.

---

## R-003 — Form library: react-hook-form mı, native form + Server Action mı?

**Decision**: react-hook-form + `@hookform/resolvers/zod` + Server Action kombinasyonu.

**Rationale**:
- Client-side hızlı validation (boş alan, email format) için react-hook-form ergonomik
- Server Action başında aynı zod schema ile tekrar validate edilir (savunma) — `safeParse` ile, hata varsa form'a return edilir
- CONSTITUTION → "Form validation zod schema, hem client hem server'da paylaşılır" gate'ini birebir karşılar (G4)

**Alternatives considered**:
- Native `<form>` + sadece Server Action validation: Daha basit ama UX zayıf (her yanlış girişte server round-trip). Reddedildi.
- Formik / Custom: Reddedildi, react-hook-form daha hafif ve Next.js Server Action'larla iyi entegre.

---

## R-004 — Top bar'da "Merhaba <kullanıcı>": email mi, display name mi?

**Decision**: Email. (`user.email`)

**Rationale**:
- Spec'te "merhaba kullanıcı" diye yazıyor; `user.user_metadata.name` gibi bir alan tek kullanıcı senaryosunda manuel doldurulmamış olabilir.
- Email auth ile geliyor, garantili dolu.
- Daha sonra display name eklenirse fallback'le güncellenebilir: `user.user_metadata.name ?? user.email`.

**Alternatives considered**:
- `user_metadata.full_name`: Boş kalabilir, fallback gerekir. Şimdilik gerek yok.
- Email'in `@` öncesi (`split('@')[0]`): Daha "kişisel" ama yanıltıcı olabilir. Reddedildi, email tam haliyle gösterilir.

---

## R-005 — Logout: Server Action mı, client `signOut` mı?

**Decision**: Server Action (`signOut()` → cookies temizler → `redirect('/login')`).

**Rationale**:
- Server-side signOut cookie'leri sunucu tarafından geçersizleştirir; client tarafından yapılırsa cookie'ler hâlâ tarayıcıda eski hâliyle bulunur ve sonraki SSR isteğinde "oturumlu" görünebilir.
- Aynı R-002 rasyoneli geçerli — server-side oturum işlemleri tutarlılık için zorunlu.

**Alternatives considered**:
- Client-side `supabase.auth.signOut()` + `router.push('/login')`: Reddedildi, race var.

---

## R-006 — Cookie naming ve options

**Decision**: `@supabase/ssr`'ın varsayılan cookie isimlendirmesi ve options'ı kullanılır. Manuel override yok.

**Rationale**:
- `@supabase/ssr` cookie'leri `sb-<project-ref>-auth-token` formatında set eder; httpOnly + secure (prod) + sameSite=lax default'ları best-practice.
- Manuel override ekleme yüzeyi sıfır kazanç, hata riski yüksek.

**Alternatives considered**:
- Manuel cookie config: Reddedildi.

---

## R-007 — `/dashboard`'ın no-cache stratejisi (FR-010)

**Decision**: Next.js default + Server Component'in `dynamic = 'force-dynamic'` opsiyonu ile her request'te yeniden render.

**Rationale**:
- Auth-korumalı sayfa cache'lenirse çıkış sonrası geri tuşu cache'i gösterir → güvenlik açığı.
- `app/(app)/layout.tsx`'te `export const dynamic = 'force-dynamic'` + Server Component'te `await supabase.auth.getUser()` çağrısı zaten cookies okuduğu için Next.js otomatik dinamik render'a düşer. Explicit `dynamic = 'force-dynamic'` belirsizliği kaldırır.
- Ayrıca middleware response'unda `Cache-Control: no-store` header'ı korumalı pathlar için eklenir (defense-in-depth).

**Alternatives considered**:
- `revalidate = 0`: Aynı etki, eski sözdizimi. Modern olan tercih edildi.
- Sadece middleware no-store: Yeterli ama Server Component dinamiklikten emin olunmuyor.

---

## R-008 — Route group strategy: `(auth)` ve `(app)` ayrımı

**Decision**: İki route group, ortak layout yok aralarında.
- `(auth)/login/page.tsx` — public, sade
- `(app)/dashboard/page.tsx` — korumalı, üst barlı layout (`(app)/layout.tsx`)

**Rationale**:
- Route group'lar URL'i etkilemez (`/login` ve `/dashboard` aynen kalır)
- `(app)` altındaki tüm gelecek sayfalar (settings, suppliers, vb.) aynı korumalı layout'u paylaşır → tek noktada auth check + top bar
- `(auth)` minimal layout (sadece form ortalı), top bar yok

**Alternatives considered**:
- Tek tip layout + her sayfa kendi auth check'i: Reddedildi, DRY ihlali.
- Layout yerine HOC pattern: Next.js App Router'da idiomatic değil. Reddedildi.

---

## R-009 — `lib/routes.ts` const pattern (G11 — no magic strings)

**Decision**: Tek dosyada literal const'lar:
```ts
export const ROUTES = {
  HOME: "/",
  LOGIN: "/login",
  DASHBOARD: "/dashboard",
} as const;
```

**Rationale**:
- CONSTITUTION → "Magic number/string yasak — const veya enum kullan" (G11)
- TypeScript `as const` ile literal type narrowing — `redirect(ROUTES.LOGIN)` tipsel hata yakalama
- Tek yerde değişiklik → tüm imports güncellenir

**Alternatives considered**:
- Enum: TypeScript enum'ları runtime overhead getirir ve string union tercih edilir. Reddedildi.
- Inline string'ler: G11 ihlali. Reddedildi.

---

## R-010 — Hata mesajları: i18n stratejisi (V1 için)

**Decision**: V1'de i18n kütüphanesi (next-intl, react-i18next vs.) kurulmaz. Tüm metinler doğrudan TR string olarak `lib/messages/auth.ts` (veya inline) tutulur. İleride ikinci dil eklenirse o aşamada library entegre edilir.

**Rationale**:
- Constitution: "Birincil dil: Türkçe (tek kullanıcı, TR pazar, TR tedarikçiler)"
- Açık sorularda EN ihtimali yok; YAGNI prensibi
- next-intl kurulumu erken eklemek = dead weight

**Alternatives considered**:
- next-intl: Reddedildi (henüz lazım değil).
- T fonksiyonu helper: Reddedildi (gereksiz indirection).

---

## R-011 — `/` (root) davranışı (FR-012)

**Decision**: `app/page.tsx` — Server Component, `supabase.auth.getUser()` çağırır; oturum varsa `redirect(ROUTES.DASHBOARD)`, yoksa `redirect(ROUTES.LOGIN)`. Sayfa hiçbir UI render etmez.

**Rationale**:
- Spec FR-012 net: `/` her zaman yönlendirme yapsın
- Server-side redirect, client-side flash olmaz
- Mevcut `app/page.tsx` (sağlık kontrolü) bu feature'da REWRITE edilir

**Alternatives considered**:
- Middleware'da yönlendirme: Mümkün ama page.tsx'te tek satır redirect daha açık ve test edilebilir.
- `/` public landing page: V1'de kapsam dışı (FR-012 redirect zorunlu).

---

## Özet

| ID | Karar | Tip |
|----|-------|-----|
| R-001 | Middleware + Layout her ikisi (defense-in-depth) | Architecture |
| R-002 | Login Server Action | API/RPC pattern |
| R-003 | react-hook-form + zod + Server Action | Form |
| R-004 | "Merhaba <email>" göster | UX |
| R-005 | Logout Server Action | API/RPC pattern |
| R-006 | `@supabase/ssr` default cookie config | Security |
| R-007 | Korumalı sayfalarda `dynamic='force-dynamic'` + no-store header | Cache/Security |
| R-008 | `(auth)` ve `(app)` route group ayrımı | File layout |
| R-009 | `lib/routes.ts` const pattern | Code quality |
| R-010 | i18n library YOK V1; inline TR string'ler | YAGNI |
| R-011 | `/` Server Component'te koşullu redirect | UX/Security |

Tüm `[NEEDS CLARIFICATION]` çözüldü (zaten yoktu). Phase 1'e geçiş için hazır.
