# Implementation Plan: Auth + Boş Dashboard İskeleti

**Branch**: `001-auth-dashboard` | **Date**: 2026-05-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-auth-dashboard/spec.md`

**Note**: This plan covers Phase 0 (research) and Phase 1 (design). Tasks are produced by `/speckit-tasks`.

## Summary

Tek kullanıcı için email + şifre auth: `/login` (public), `/dashboard` (auth-korumalı), ortak üst bar (karşılama + çıkış). Yaklaşım: Next.js App Router'da route group'larla public/private ayrımı (`(auth)` ve `(app)`), Supabase SSR helper'ları (`@supabase/ssr`), Server Action tabanlı sign-in / sign-out, middleware seviyesinde route guard + Server Component'te defense-in-depth ikinci kontrol. Form validation zod schema ile hem client (react-hook-form) hem server (Server Action başında) tarafında. Tüm UI Türkçe.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict, `noUncheckedIndexedAccess`), Node 22 (Vercel runtime), Next.js 15 (App Router), React 19

**Primary Dependencies**: `@supabase/ssr` 0.7, `@supabase/supabase-js` 2.48, `react-hook-form` 7.54, `@hookform/resolvers` 3.9, `zod` 3.24, `tailwindcss` 4, `lucide-react` (logout icon)

**Storage**: Supabase Auth (`auth.users` tablosu — Supabase managed). Bu feature için `public` şemasında yeni tablo yok. Oturum yönetimi cookie tabanlı (`@supabase/ssr` cookie handler).

**Testing**: Manuel + Acceptance Scenario kontrolü (Vitest infra bu feature'da kurulmuyor — ilk birim testi yazılana kadar erteleniyor; CONSTITUTION test gerekliliği "kritik path için zorunlu" diyor, auth flow için manuel acceptance scenarios yeterli kabul ediliyor)

**Target Platform**: Vercel (Edge runtime opsiyonel ama Node runtime kullanıyoruz — middleware'da Supabase SSR cookies için), modern evergreen browser'lar (Chrome/Edge/Safari/Firefox son 2 major)

**Project Type**: Web application — unified Next.js App Router (frontend + server actions + middleware aynı kod tabanı; ayrı backend yok bu feature için)

**Performance Goals**:
- Login response (submit → redirect) ortalama **< 1 saniye** (SC-002 dolaylı)
- `/dashboard` ilk paint **< 2 saniye** (Server Component, minimum JS)
- Çıkış (click → /login) **< 2 saniye** (SC-004)

**Constraints**:
- Tüm UI metinleri Türkçe; Türkçe karakter ı/İ/ş/ğ/ç/ö/ü her yerde test edilmeli
- Secret'lar (Supabase URL, anon key) `NEXT_PUBLIC_*` env var; service role key yalnız server (bu feature kullanmıyor)
- Auth cookie'leri httpOnly + secure + sameSite=lax (Supabase SSR default'u)
- No-cache header'lar korumalı sayfalarda (FR-010)

**Scale/Scope**:
- 1 aktif kullanıcı
- 3 route: `/`, `/login`, `/dashboard`
- 1 middleware (genişletiliyor: route guard ekleniyor)
- 1 form, 1 buton, 1 üst bar

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Aşağıdaki gate'ler `.docs/CONSTITUTION.md`'den türetilmiştir. Hepsi planlama sonrası tekrar değerlendirilir.

| # | Gate | Kaynak | Durum | Not |
|---|------|--------|-------|-----|
| G1 | **Secrets in source code:** API key / secret kaynak kodda olmaz | CONSTITUTION → Güvenlik | ✅ PASS | Tüm değerler `process.env.*` üzerinden; `.env.local` gitignored |
| G2 | **Server Component default:** Client component sadece interaktivite için | CONSTITUTION → Kod konvansiyonları | ✅ PASS | LoginForm + LogoutButton client (form/onClick); root `/`, `/dashboard`, üst bar Server Component |
| G3 | **Service module pattern:** Supabase çağrıları `lib/supabase/*`'ta | CONSTITUTION → Kod konvansiyonları | ✅ PASS | Mevcut `lib/supabase/{client,server,middleware}.ts` kullanılır; Server Action'lar bu module'leri import eder |
| G4 | **Form validation zod:** Hem client hem server'da paylaşılan zod schema | CONSTITUTION → Kod konvansiyonları | ✅ PASS | `lib/validations/auth.ts` — schema hem `LoginForm` hem Server Action'da kullanılır |
| G5 | **RLS zorunlu:** Yeni her tabloda RLS açık | CONSTITUTION → Backend → Güvenlik | ✅ PASS (N/A) | Bu feature yeni tablo açmıyor; sadece Supabase-managed `auth.users` kullanır |
| G6 | **Türkçe i18n:** Birincil dil TR; tüm metinler ve karakterler test edilmiş | CONSTITUTION → i18n | ✅ PASS | Tüm UI string'leri ve hata mesajları TR; `<html lang="tr">` mevcut |
| G7 | **Tek kullanıcı kısıtı:** Çoklu kullanıcı/rol mantığı V1'de yok | CONSTITUTION → Kısıtlar | ✅ PASS | Hesap manuel oluşturulur; sign-up akışı yok (FR-013) |
| G8 | **Sıfır maliyet:** Ücretli servis eklenmez | CONSTITUTION → Kısıtlar | ✅ PASS | Supabase Auth free tier (50K MAU), Vercel Hobby — bu feature tek kullanıcı, sıfır maliyet |
| G9 | **Anti-goal koruması:** 2FA, sosyal, sign-up, password reset V1 dışı | Spec FR-013/14/15 | ✅ PASS | Plan hiçbirini implement etmez; kod yapısında bu route'lar yer almaz |
| G10 | **Naming convention:** kebab-case dosya, PascalCase component, camelCase var | CONSTITUTION → Kod standartları | ✅ PASS | `login-form.tsx` → `LoginForm`, `signIn()` Server Action, vb. |
| G11 | **No magic strings:** Route path, error message vb. `const` veya schema'da | CONSTITUTION → Kod standartları | ✅ PASS | Route path'leri `lib/routes.ts` const; error message'lar form schema'sında |
| G12 | **Cookie güvenliği:** Auth cookie httpOnly + secure + sameSite | Genel güvenlik + CONSTITUTION | ✅ PASS | `@supabase/ssr` default'u httpOnly/secure/sameSite=lax sağlar |

**Sonuç:** Tüm gate'ler ✅. Complexity Tracking gerekmiyor.

**Post-Phase 1 re-check (2026-05-16):** Tüm gate'ler tekrar değerlendirildi (research.md + data-model.md + contracts/auth-actions.md sonrası). Hiçbir gate'te regresyon yok; tasarım kararları (defense-in-depth route guard, Server Action tabanlı signIn/signOut, paylaşılan zod schema, `lib/routes.ts` const'ları, `dynamic = 'force-dynamic'`) gate'leri pekiştiriyor. Constitution Check ✅ tekrar PASS.

## Project Structure

### Documentation (this feature)

```text
specs/001-auth-dashboard/
├── plan.md              # This file
├── spec.md              # Feature spec (mevcut)
├── research.md          # Phase 0 çıktısı
├── data-model.md        # Phase 1 çıktısı
├── quickstart.md        # Phase 1 çıktısı — manuel test akışı
├── contracts/
│   └── auth-actions.md  # Server Action contract'ları (signIn, signOut)
├── checklists/
│   └── requirements.md  # Spec kalite checklist'i (mevcut)
└── tasks.md             # /speckit-tasks çıktısı (bu komut tarafından oluşturulmaz)
```

### Source Code (repository root)

```text
app/
├── layout.tsx                       # (mevcut) Root layout, <html lang="tr">
├── globals.css                      # (mevcut)
├── page.tsx                         # (mevcut, REWRITE edilecek) → "/" redirect logic
├── (auth)/
│   └── login/
│       ├── page.tsx                 # Login sayfası — LoginForm'u render eder
│       └── actions.ts               # Server Action: signIn(formData)
└── (app)/
    ├── layout.tsx                   # Korumalı route'ların ortak layout'u — üst bar burada + auth check
    └── dashboard/
        └── page.tsx                 # Boş dashboard sayfası — "Hoş geldin" + placeholder

components/
├── features/
│   └── auth/
│       ├── login-form.tsx           # Client component — react-hook-form + zod
│       └── logout-button.tsx        # Client component — Server Action tetikler
└── ui/
    └── top-bar.tsx                  # Server Component — kullanıcı email + LogoutButton

lib/
├── supabase/
│   ├── client.ts                    # (mevcut)
│   ├── server.ts                    # (mevcut)
│   └── middleware.ts                # (mevcut, EXTEND edilecek) — route guard mantığı eklenecek
├── validations/
│   └── auth.ts                      # zod schema: loginSchema
├── routes.ts                        # Route path const'ları (ROUTES.LOGIN, ROUTES.DASHBOARD, vb.)
└── utils.ts                         # (mevcut)

middleware.ts                        # (mevcut, kalır — updateSession çağırıyor)

specs/001-auth-dashboard/            # (yukarıdaki Documentation bölümü)
supabase/migrations/                 # (mevcut, bu feature migration eklemez)
```

**Structure Decision**: Unified Next.js App Router yapısı. Backend/frontend ayrımı yok — server kodu (Server Action'lar, middleware) ve client kodu (Form component'ları) aynı kod tabanında, Next.js'in `"use client"` / Server Action sınırlarıyla ayrışıyor. Route group'lar (`(auth)` ve `(app)`) URL'i etkilemeden public vs. korumalı sayfa ayrımı için kullanılıyor.

## Phase 0 — Research

Output: [research.md](./research.md)

Spec'te `[NEEDS CLARIFICATION]` marker'ı yoktu; yine de planlama sırasında karara bağlanması gereken teknik seçimleri (router guard'ın katmanı, cookie naming, Server Action vs. Route Handler vb.) araştırıp `research.md`'de Decision / Rationale / Alternatives Considered formatında belgeledim.

## Phase 1 — Design & Contracts

Outputs:
- [data-model.md](./data-model.md) — Veri varlıkları (User, Session) + state transitions
- [contracts/auth-actions.md](./contracts/auth-actions.md) — Server Action contract'ları (input/output, hata kodları)
- [quickstart.md](./quickstart.md) — Geliştirici/QA için manuel test akışı
- `CLAUDE.md` SPECKIT bloğunda plan referansı güncellendi

## Phase 2 — Tasks (sonraki komut)

`/speckit-tasks` `tasks.md`'yi üretecek. Bu komut çıktısı **bu plan tarafından oluşturulmaz**.

## Complexity Tracking

> Doldurulması gerekli değil — Constitution Check tüm gate'leri ✅ geçti, sapma yok.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| _(yok)_ | _(yok)_ | _(yok)_ |
