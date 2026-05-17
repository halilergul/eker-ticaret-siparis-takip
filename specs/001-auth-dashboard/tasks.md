---
description: "Task list for feature 001-auth-dashboard"
---

# Tasks: Auth + Boş Dashboard İskeleti

**Input**: Design documents from `/specs/001-auth-dashboard/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/auth-actions.md](./contracts/auth-actions.md), [quickstart.md](./quickstart.md)

**Tests**: Otomatik test task'ı **yok**. Auth feature için manuel acceptance kontrolü (quickstart.md QS-01 → QS-09) yeterli kabul edildi. Vitest infrastructure ilk birim testi gerektiğinde eklenecek.

**Organization**: Task'lar user story'ye göre gruplandı (US1, US2). Her story bağımsız demo edilebilir.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Farklı dosyalar, paralel çalışabilir (önceki task'lara bağımlı değil)
- **[Story]**: Hangi user story'ye ait (US1, US2)
- File path'leri tam ve repo köküne göre verildi

## Path Conventions

Bu proje **unified Next.js App Router** yapısı kullanır (plan.md → Structure Decision):
- `app/`, `components/`, `lib/` repo kökünde
- Backend/frontend ayrımı yok — Server Action'lar ve client component'ler aynı tree'de

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Bu feature'a özel paylaşılan utility dosyaları. _(Bootstrap kodu — Next.js init, Supabase client/server/middleware, Tailwind, eslint, env'ler — zaten kuruldu; bu fazda sadece yeni shared modüller var.)_

- [X] T001 [P] Create `lib/routes.ts` with route path constants exported as `ROUTES = { HOME: "/", LOGIN: "/login", DASHBOARD: "/dashboard" } as const`. Used everywhere instead of magic string route paths (Constitution gate G11, research R-009).
- [X] T002 [P] Create `lib/validations/auth.ts` exporting `loginSchema` (zod) with email + password fields and TR error messages, plus `LoginInput` type via `z.infer`. Schema is imported by both `LoginForm` (client validation via @hookform/resolvers) and `signIn` Server Action (server safeParse). See contracts/auth-actions.md → Input section.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Middleware-seviyesi route guard ve no-cache header. Her iki user story de bu altyapıya bağlıdır (US1 → `/dashboard` koruması, US2 → cache no-leak garantisi).

**⚠️ CRITICAL**: User story'ler buraya kadar tamamlanmadan başlayamaz.

- [X] T003 Extend `lib/supabase/middleware.ts` `updateSession()` to apply route guard logic per the matrix in contracts/auth-actions.md → "Middleware contract". After the existing `getUser()` call, check `request.nextUrl.pathname` against `ROUTES` (import from `@/lib/routes`): if path starts with `/dashboard` and user is null → `NextResponse.redirect(new URL(ROUTES.LOGIN, request.url))`; if path is `/login` and user is not null → `NextResponse.redirect(new URL(ROUTES.DASHBOARD, request.url))`; if path is `/` → redirect based on user (`/dashboard` if logged in, `/login` otherwise). Preserve cookie set-all behavior in the returned response. Keep `await supabase.auth.getUser()` — kritik, kaldırma.
- [X] T004 In `lib/supabase/middleware.ts`, for responses where the request path matches `/dashboard` or sub-paths, set `Cache-Control: no-store, no-cache, must-revalidate` header on `supabaseResponse` before returning. This implements FR-010 / R-007 (browser back-button cache leak prevention).

**Checkpoint**: Foundation hazır. Bu noktada `npm run dev` → `/dashboard`'a doğrudan gitmek `/login`'e atar (page'ler henüz yok ama yönlendirme çalışır); `/login` 404 verir (sayfa US1'de). Geçici kırık durum normal.

---

## Phase 3: User Story 1 — Tek kullanıcı giriş yapıp korumalı panele ulaşır (Priority: P1) 🎯 MVP

**Goal**: Kullanıcı `/login`'de email + şifre ile giriş yapar, `/dashboard`'a yönlendirilir, üst barda kendi email'iyle karşılama görür. Giriş yapmamış biri `/dashboard`'a ulaşamaz (`/login`'e atılır). Hatalı giriş generic "Email veya şifre hatalı" mesajı verir.

**Independent Test**: Manuel test `quickstart.md` QS-01, QS-02, QS-03, QS-04, QS-07, QS-08, QS-09 — hepsi geçmeli. Çıkış akışı (QS-05, QS-06) bu story'de yok; US2'de.

### Implementation for User Story 1

- [X] T005 [P] [US1] Create `app/(auth)/login/actions.ts` with `"use server"` directive at top. Export `async function signIn(formData: FormData): Promise<{ error: string } | void>` per contracts/auth-actions.md → "Action: signIn". Flow: `loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") })` → on failure return `{ error: zod ilk mesajı }`; `createClient` from `@/lib/supabase/server` → `supabase.auth.signInWithPassword({ email, password })` → map errors to TR messages (yanlış şifre / rate limit / network / generic) → on success `revalidatePath("/", "layout")` then `redirect(ROUTES.DASHBOARD)`. Hiçbir durumda Supabase iç hata mesajı kullanıcıya sızdırılmaz.
- [X] T006 [P] [US1] Create `components/features/auth/login-form.tsx` as a Client Component (`"use client"`). Uses `useForm<LoginInput>({ resolver: zodResolver(loginSchema) })` from `react-hook-form` + `@hookform/resolvers/zod`. Renders `<form action={signIn}>` (Server Action from T005). Input fields: email + password with Tailwind styling. Submit button labeled "Giriş Yap". Shows form errors below each field (TR mesajlar from loginSchema) + a top-level error banner for server-returned `error` string (via `useFormState` from React 19). All labels and placeholders in TR.
- [X] T007 [US1] Create `app/(auth)/login/page.tsx` as a Server Component. Imports `LoginForm` from T006. Renders a centered, minimal layout: heading "Eker Ticaret — Giriş", `<LoginForm />` inside a card. `export const metadata = { title: "Giriş — Eker Ticaret" }`. No top bar (this is a public route group, not `(app)`). Depends on: T006.
- [X] T008 [P] [US1] Create `components/ui/top-bar.tsx` as a Server Component. Accepts no props — internally calls `await createClient()` (from `@/lib/supabase/server`) → `getUser()` → renders header bar with "Merhaba {user.email}" on the left. **Logout button yok bu story'de — US2'de eklenecek.** Tailwind styling: sticky top, border-bottom, padding, flex layout. If `user` is null returns null (defensive — bu component sadece `(app)` altında çağrılır, oturumlu olmalı).
- [X] T009 [US1] Create `app/(app)/layout.tsx` as a Server Component with `export const dynamic = "force-dynamic"`. Defense-in-depth auth check: `await createClient()` → `getUser()` → if `user` is null `redirect(ROUTES.LOGIN)` (per R-001 / R-007). Renders `<TopBar />` (from T008) above `{children}` inside a min-h-screen flex column. Depends on: T008.
- [X] T010 [P] [US1] Create `app/(app)/dashboard/page.tsx` as a Server Component. Placeholder content: heading "Dashboard", subheading "Yakında: fiyat takip kartları", and a short paragraph "Tedarikçi sitelerden çekilen fiyatlar burada listelenecek." `export const metadata = { title: "Dashboard — Eker Ticaret" }`. No auth check needed in page (layout T009 already handles it).
- [X] T011 [US1] Rewrite `app/page.tsx` (currently a health-check page) as a Server Component that performs root redirect per R-011 / FR-012. Imports `createClient` from `@/lib/supabase/server` and `ROUTES` from `@/lib/routes`. Call `await createClient()` → `getUser()` → if user exists `redirect(ROUTES.DASHBOARD)` else `redirect(ROUTES.LOGIN)`. Function body returns nothing visible (redirect throws). Remove all current health-check UI.

**Checkpoint US1**: User Story 1 fully functional. Run `npm run dev`, then `quickstart.md` QS-01 → QS-04 + QS-07 → QS-09. Expected: doğru bilgilerle giriş → `/dashboard`, "Merhaba {email}" görünür; giriş yapmadan `/dashboard` → `/login`; yanlış şifre generic mesaj; zaten giriş yapmışken `/login` → `/dashboard`; form validation + Türkçe karakter + 24h persist hepsi çalışır. **Logout butonu henüz yok**, oturum kapatmak için DevTools → Application → Cookies temizlenir.

---

## Phase 4: User Story 2 — Kullanıcı oturumu temiz şekilde kapatır (Priority: P2)

**Goal**: Üst bardaki "Çıkış" butonu oturumu sonlandırır, kullanıcıyı `/login`'e döndürür. Çıkış sonrası tarayıcı geri tuşu korumalı içerik göstermez.

**Independent Test**: Manuel test `quickstart.md` QS-05 ve QS-06.

### Implementation for User Story 2

- [X] T012 [US2] Add `async function signOut(): Promise<void>` export to `app/(auth)/login/actions.ts` (same file as T005's `signIn` — Server Actions for related concern bundled). Per contracts/auth-actions.md → "Action: signOut". Flow: `createClient` from `@/lib/supabase/server` → `try { await supabase.auth.signOut() } catch { /* sessiz log */ }` (cookie temizleme + redirect garantili olmalı, signOut hatası kullanıcıya gösterilmez) → `revalidatePath("/", "layout")` → `redirect(ROUTES.LOGIN)`.
- [X] T013 [P] [US2] Create `components/features/auth/logout-button.tsx` as a Client Component (`"use client"`). Renders `<form action={signOut}>` (Server Action from T012, imported from `@/app/(auth)/login/actions`) wrapping a button labeled "Çıkış" with a `LogOut` lucide-react icon. Tailwind styling matching top bar visual language. No internal state needed — form submission triggers Server Action which redirects.
- [X] T014 [US2] Modify `components/ui/top-bar.tsx` (created in T008) to import and render `<LogoutButton />` from T013. Place button on the right side of the bar (flex justify-between with greeting on left). Depends on T013.

**Checkpoint US2**: User Story 2 fully functional. Run quickstart QS-05 (çıkış → `/login` < 2 sn) ve QS-06 (geri tuşu cache sızıntısı yok). Bu noktada **tüm spec acceptance scenarios** geçmiş olmalı.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Tüm story'leri kapsayan son temizlik ve regression check.

- [X] T015 [P] Update `.docs/CHANGES.md` with a new entry: `CR-001 — 001-auth-dashboard implementation completed (2026-05-16). Etkilenen: app/(auth), app/(app), components/features/auth, components/ui, lib/routes.ts, lib/validations/auth.ts, lib/supabase/middleware.ts, app/page.tsx, middleware.ts.`
- [X] T016 [P] Run `npm run type-check` from repo root. Fix any TypeScript errors. Expected: 0 hata.
- [X] T017 [P] Run `npm run lint` from repo root. Fix any ESLint errors / warnings. Expected: 0 hata.
- [X] T018 Run full `quickstart.md` regression: QS-01 → QS-09 sırayla, hepsi geçmeli. Sonuç tablosunu (quickstart.md sonundaki) doldur.
- [X] T019 [P] If during quickstart any visual issue noted (Türkçe karakter, font, spacing), capture in `.docs/dev-gotchas.md` for future reference.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Bağımsız — hemen başlanabilir
- **Foundational (Phase 2)**: Setup'a bağımlı (T001 ROUTES, T002 schema). User story'leri **engeller**.
- **US1 (Phase 3)**: Foundational'a bağımlı
- **US2 (Phase 4)**: Foundational'a bağımlı **+ US1'in T008 (top-bar) ve T005 (actions.ts) dosyaları mevcut olmalı** (T014 top-bar'ı modify eder, T012 actions.ts'e ekleme yapar). Pratikte: US2 implementer'ı US1 sonrası başlamalı (veya en azından US1'in T005 + T008 task'ları biter bitmez US2'ye geçilebilir).
- **Polish (Phase 5)**: Tüm story'ler tamamlandıktan sonra

### Detaylı task dependency'leri (within phases)

```
T001 (lib/routes.ts)      ──┐
T002 (lib/validations)    ──┤
                            ▼
T003 (middleware guard)   ─── kullanır → T001
T004 (no-cache header)    ─── T003 ile aynı dosya, sıralı
                            ▼
[Phase 3 — US1]
T005 (login actions.ts)   ─── kullanır → T002 (loginSchema), T001 (ROUTES)
T006 (LoginForm)          ─── kullanır → T002, T005
T007 (login page)         ─── kullanır → T006
T008 (TopBar)             ─── kullanır → server.ts (mevcut)
T009 (app layout)         ─── kullanır → T008, T001
T010 (dashboard page)     ─── bağımsız
T011 (page.tsx rewrite)   ─── kullanır → T001
                            ▼
[Phase 4 — US2]
T012 (signOut action)     ─── kullanır → T005'in dosyası (modifies), T001
T013 (LogoutButton)       ─── kullanır → T012
T014 (TopBar modify)      ─── kullanır → T008 (modifies), T013
                            ▼
[Phase 5 — Polish]
T015-T019 (parallel polish, en sonda)
```

### Parallel Opportunities

**Phase 1 (Setup):**
- `T001` ve `T002` ayrı dosyalar — **paralel**.

**Phase 2 (Foundational):**
- `T003` ve `T004` aynı dosyayı düzenler — **sıralı** (T003 → T004).

**Phase 3 (US1):**
- `T005` (actions.ts) ve `T006` (LoginForm) ve `T008` (TopBar) ve `T010` (dashboard page) — **paralel başlanabilir** (ayrı dosyalar, T002/T001 yapıldıktan sonra).
- Aynı zamanda `T011` (page.tsx rewrite) de bağımsız — paralel.
- `T007` (login page) T006 sonrası; `T009` (app layout) T008 sonrası — bunlar sıralı.

**Phase 4 (US2):**
- `T012` (signOut) ve `T013` (LogoutButton) — `T013` `T012`'ye import bağımlılığı ile bağlı; ama yine de ayrı dosyalar → **bir geliştirici T012'yi yazarken diğeri T013'ün UI iskeletini hazırlayabilir**.
- `T014` (TopBar modify) `T013` sonrası.

**Phase 5 (Polish):**
- `T015`, `T016`, `T017`, `T019` — **paralel**.
- `T018` (full regression) son sırada.

---

## Parallel Example: Phase 3 (US1) kickoff

Setup + Foundational tamamlandıktan sonra dört task aynı anda başlayabilir:

```text
# US1 paralel başlangıç (4 dosya, 4 farklı sorumluluk):
Task: "Create app/(auth)/login/actions.ts (signIn Server Action)"
Task: "Create components/features/auth/login-form.tsx (Client Component, react-hook-form + zod)"
Task: "Create components/ui/top-bar.tsx (Server Component, greeting only)"
Task: "Create app/(app)/dashboard/page.tsx (placeholder content)"
# Aynı anda T011 (page.tsx rewrite) da yapılabilir
```

`T007` (login page) `T006` sonrası açılır; `T009` (app layout) `T008` sonrası açılır.

---

## Implementation Strategy

### MVP First (Sadece US1)

1. Phase 1 (Setup) tamamlandı → 2 paylaşılan modül
2. Phase 2 (Foundational) tamamlandı → middleware route guard + no-cache
3. Phase 3 (US1) tamamlandı → login + dashboard çalışır
4. **STOP & VALIDATE**: `quickstart.md` QS-01 → QS-04 + QS-07 → QS-09 yap
5. Buraya kadar gerçek MVP: kullanıcı giriş yapıp dashboard'u görebiliyor. Demo edilebilir.

### Incremental Delivery

1. Setup + Foundational + US1 → **MVP demo** (login + dashboard)
2. US2 ekle → **Tam acceptance**: çıkış butonu + cache no-leak
3. Polish → Type/lint temiz + dev-gotchas güncel

### Solo (tek geliştirici) Strategy

User tek başına geliştiriyor; takım yok. Sıralı akış en gerçekçi:

```text
T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011
  → Checkpoint US1 manuel test
  → T012 → T013 → T014
  → Checkpoint US2 manuel test
  → T015 → T016 → T017 → T019 → T018 (regression)
```

Her checkpoint'te `npm run dev` → tarayıcıda manuel doğrulama. Type/lint sürekli `npm run type-check` ile koşturulur.

---

## Format Validation

Aşağıdaki tablo tüm task'ların **strict checklist format**'a uygun olduğunu doğrular:

| Task ID | Has `- [ ]` | Has Task ID | Has [Story] (if user story phase) | Has file path |
|---------|:-----------:|:-----------:|:---------------------------------:|:-------------:|
| T001 | ✅ | ✅ | N/A (Setup) | ✅ |
| T002 | ✅ | ✅ | N/A (Setup) | ✅ |
| T003 | ✅ | ✅ | N/A (Foundational) | ✅ |
| T004 | ✅ | ✅ | N/A (Foundational) | ✅ |
| T005-T011 | ✅ | ✅ | ✅ [US1] | ✅ |
| T012-T014 | ✅ | ✅ | ✅ [US2] | ✅ |
| T015-T019 | ✅ | ✅ | N/A (Polish) | ✅ |

**Toplam: 19 task. Hepsi format-compliant.**

---

## Notes

- **Test stratejisi:** Otomatik test yok bu feature'da. `quickstart.md` 9 manuel adımla acceptance kapsar. Spec'te bu kabul edildi.
- **Parallel marker [P]:** Aynı anda farklı dosyalar üzerinde çalışan ve önceki task'lara bağımlı olmayan task'larda var.
- **[Story] label:** Sadece Phase 3 (US1) ve Phase 4 (US2) task'larında.
- **Commit pattern:** Her task veya küçük grup sonrası commit önerilir (`git add -A && git commit -m "T0XX: ..."`).
- **Stop at checkpoint:** US1 checkpoint'inde durup demo edebilirsin — US2 sonraya bırakılabilir.

---

## Özet sayım

- **Toplam task:** 19
- **Phase 1 (Setup):** 2 task (her ikisi [P])
- **Phase 2 (Foundational):** 2 task (sıralı, aynı dosya)
- **Phase 3 (US1, MVP):** 7 task — Bağımsız test edilebilir, MVP buradan demo edilebilir
- **Phase 4 (US2):** 3 task — US1 üzerine inşa
- **Phase 5 (Polish):** 5 task (4 paralel + 1 regression)
- **Parallel slot'lar:** Phase 1 (2), Phase 3 (5 dosya), Phase 5 (4)
- **Suggested MVP scope:** Phase 1 + Phase 2 + Phase 3 (US1). Toplam 11 task. Bu noktada `/dashboard` + login + greeting çalışır; logout yok ama acceptance'ın çoğu (QS-01 → QS-04, QS-07 → QS-09) geçer.
