# Implementation Plan: Sipariş Listesi Dashboard

**Branch**: `005-orders-dashboard` | **Date**: 2026-05-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-orders-dashboard/spec.md`

## Summary

`/dashboard` route'u 001'de boş bırakılmıştı; bu feature içerik dolduruyor. Server Component olarak `supplier_orders` + `suppliers` join sorgusu yapılır, sonuç bir `<OrderTable>` component'ine pas geçilir. Filter UI (supplier + status dropdown'ları) **URL search params** üzerinden çalışır — Server Component re-render edilir, client-side state YOK. TR locale formatting `Intl` ile inline (library YOK). Sipariş detayı **ayrı route** `/dashboard/orders/[id]` — modal yerine basit page, Server Component dostu.

Veri kaynağı: 003 schema'daki `supplier_orders` + `order_items` (RLS-respecting authenticated client; 003'te `(select auth.uid()) IS NOT NULL` policy + GRANT). Service_role kullanılmaz (client tarafa sızabilir). RLS sayesinde authenticated user tüm satırları görür (single-user senaryo).

Veri sorgu modülleri `lib/queries/orders.ts` (yeni) altında toplanır — Constitution G2 service module pattern. Server Component'lar bunları çağırır, UI bilmez nereden geldiğini.

UI: Tailwind v4 (mevcut) + minimum custom CSS; shadcn/ui eklenmez V1'de (basit Tailwind class'lar yeterli). lucide-react ikonları (mevcut dep) kullanılır gerekirse.

## Technical Context

**Language/Version**: TypeScript 5.x, React 19, Next.js 15 (App Router, Server Components default).

**Primary Dependencies**: `@supabase/ssr` (mevcut), `lucide-react` (icons, gerekirse), Tailwind v4 (mevcut). Yeni dep YOK.

**Storage**: Supabase Postgres — read-only sorgular. Tablolar: `supplier_orders`, `suppliers` (join), `order_items` (detay).

**Testing**: Manuel (quickstart.md). Vitest unit testleri opsiyonel — bu feature küçük + tip-güvenli + RLS server-side; manuel test yeterli MVP için.

**Target Platform**: Web — desktop browser (1024px+, optimal 1280px+). Mobil V1 anti-goal.

**Project Type**: Web application — Next.js App Router; bu feature pure UI + read-only data fetching.

**Performance Goals**: İlk paint (FCP) <2sn @ 50 sipariş; <4sn @ 500 sipariş (SC-002). Server Component sayesinde JS bundle tarafı minimal.

**Constraints**: Free tier (Supabase + Vercel). Tek kullanıcı. No realtime, no pagination, no mobil (assumptions).

**Scale/Scope**: ~5 yeni TS/TSX dosya: `lib/queries/orders.ts`, `components/features/orders/{order-table,filter-bar,order-row,order-detail-card,empty-state}.tsx`, `app/(app)/dashboard/page.tsx` (rewrite), `app/(app)/dashboard/orders/[id]/page.tsx` (yeni). ~400 satır kod.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Gate | Kaynak | Durum | Not |
|---|------|--------|-------|-----|
| G1 | **Secrets in source code** | CONSTITUTION → Güvenlik | ✅ PASS (N/A) | UI feature; secret yok. |
| G2 | **Service module pattern** | CONSTITUTION → Kod konvansiyonları | ✅ PASS | `lib/queries/orders.ts` data layer; component'lar bilmez. |
| G3 | **Server Component default** | CONSTITUTION → Kod konvansiyonları | ✅ PASS | Tüm sayfa + table Server Component; sadece dropdown change handler Client island. |
| G4 | **Form validation zod** | CONSTITUTION → Kod konvansiyonları | ✅ PASS | URL search params zod ile parse + valide (FilterState schema). |
| G5 | **RLS zorunlu** | CONSTITUTION → Backend | ✅ PASS | Authenticated client (anon key + cookie session); 003 RLS politikaları görev yapıyor. service_role YOK. |
| G6 | **Türkçe i18n** | CONSTITUTION → i18n | ✅ PASS | Tüm metinler TR; tarih/sayı `Intl` TR locale. |
| G7 | **Tek kullanıcı kısıtı** | CONSTITUTION → Kısıtlar | ✅ PASS | Per-user filter YOK; RLS basit. |
| G8 | **Sıfır maliyet** | CONSTITUTION → Kısıtlar | ✅ PASS | Free tier Supabase + Vercel. |
| G9 | **Anti-goal koruması** | CONSTITUTION → Anti-goal | ✅ PASS | Mobil yok, çoklu kullanıcı yok, stok/satış yok. |
| G10 | **Naming convention** | CONSTITUTION → Kod standartları | ✅ PASS | kebab-case dosyalar, PascalCase component'lar, camelCase fonksiyonlar. |
| G11 | **No magic strings** | CONSTITUTION → Kod standartları | ✅ PASS | Route'lar `lib/routes.ts` (001), status/supplier filtre değerleri DB'den (dinamik). |
| G12 | **service_role secret never client-side** | CONSTITUTION → Güvenlik | ✅ PASS | service_role hiç kullanılmaz; anon key + RLS yeterli. |
| G13 | **Çoklu adapter mimarisi** | CONSTITUTION → Mimari kararlar | ✅ PASS (N/A) | UI feature; adapter pattern data layer'a etkilemez. |
| G14 | **Migration file-versioning** | CONSTITUTION → Stack | ✅ PASS (N/A) | Bu feature yeni migration eklemez. |
| G15 | **Auth middleware koruyor** | CONSTITUTION → Güvenlik | ✅ PASS | 001'deki middleware `/dashboard/*` route'unu zaten guard ediyor; defense-in-depth `app/(app)/layout.tsx` da var. |

**Sonuç**: 15/15 ✅ PASS. Sapma yok.

## Project Structure

### Documentation (this feature)

```text
specs/005-orders-dashboard/
├── plan.md
├── spec.md
├── research.md                  # Phase 0 — 10-12 karar
├── data-model.md                # Phase 1 — UI projection tipler + SQL pattern
├── contracts/
│   ├── routes.md                # /dashboard + /dashboard/orders/[id] kontratı
│   ├── filter-url.md            # URL search params şeması
│   └── data-queries.md          # lib/queries/orders.ts API kontratı
├── quickstart.md                # Phase 1 — manuel doğrulama
├── checklists/
│   └── requirements.md
└── tasks.md                     # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
app/
└── (app)/
    └── dashboard/
        ├── page.tsx                          # GÜNCELLENİR — sipariş tablosu + filter
        └── orders/
            └── [id]/
                └── page.tsx                  # YENİ — sipariş detayı

components/
└── features/
    └── orders/
        ├── order-table.tsx                   # YENİ — server tablo
        ├── filter-bar.tsx                    # YENİ — Client Component (dropdown + URL push)
        ├── order-row.tsx                     # YENİ — bir tablo satırı (Link to detail)
        ├── order-detail-card.tsx             # YENİ — detay sayfası içeriği
        └── empty-state.tsx                   # YENİ — boş tablo durumu

lib/
├── queries/                                  # YENİ KLASÖR
│   └── orders.ts                             # listOrders(filter), getOrderDetail(id), listSuppliers(), listDistinctStatuses()
├── format/                                   # YENİ KLASÖR
│   ├── date.ts                               # formatTrDate(iso) → "16.05.2026" | "X gün önce"
│   └── currency.ts                           # formatTry(amount) → "1.234,56 ₺"
├── routes.ts                                 # GÜNCELLENİR — ORDERS_DETAIL ekle
└── validations/
    └── order-filter.ts                       # YENİ — zod schema for URL params

# Mevcut, dokunulmaz:
lib/supabase/{client,server,middleware}.ts   # 001 + 003 changes
app/(app)/layout.tsx                          # 001
```

**Structure Decision**: Next.js App Router conventions korunur. Yeni kategoriler:
- **`lib/queries/`**: Data fetching modülleri (003 sonrası şart oldu — typed Supabase client'tan gelen veriyi UI'a hazır şekle çevirir). Constitution G2 (service module pattern).
- **`lib/format/`**: Cross-cutting display helper'lar (TR locale). Component'lar import eder, business logic değil.
- **`components/features/orders/`**: 001'deki `components/features/auth/` pattern'ı takip eder. Feature başına klasör.

Detay sayfası **ayrı route** olarak yapılır (modal değil) — Server Component'larla daha doğal akış, URL bookmark'lanabilir, geri butonu doğal çalışır (research R-004'te detaylı gerekçe).

## Complexity Tracking

> Sapma yok; tablo doldurulmaz.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
