---
description: "Task list — feature 005 sipariş listesi dashboard implementation"
---

# Tasks: Sipariş Listesi Dashboard

**Input**: Design documents from `/specs/005-orders-dashboard/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/{routes,filter-url,data-queries}.md

**Tests**: Vitest unit testleri **OPSİYONEL** — bu feature için test task'ı eklenmedi; manuel doğrulama [quickstart.md](./quickstart.md) üzerinden (QS-00 → QS-10).

**Organization**: Task'lar user story bazında gruplandı. US1 = MVP (liste görünür), US2 = filter, US3 = detay.

## Format

`- [ ] [TaskID] [P?] [Story?] Description with file path`

- `[P]`: paralel çalıştırılabilir (farklı dosya, bağımlılık yok)
- `[Story]`: US1 / US2 / US3 (Setup/Foundational/Polish'te yok)

## Path Conventions

- `app/(app)/dashboard/` — route'lar (page + detay)
- `components/features/orders/` — feature component'leri
- `lib/queries/orders.ts` — data layer
- `lib/format/{date,currency}.ts` — TR locale helper
- `lib/validations/order-filter.ts` — zod schema
- `lib/routes.ts` — route sabitleri (001'de var, güncellenir)

---

## Phase 1: Setup

- [X] T001 Verify build baseline: `npx tsc --noEmit` clean; `npm run dev` started successfully; `/login` and `/dashboard` redirect work (001 baseline). Sadece doğrulama; kod değişikliği yok.
- [X] T002 Verify DB has data: `mcp__supabase__execute_sql("SELECT count(*) FROM public.supplier_orders;")` returns ≥1. Eğer 0 ise: `npm run scrape -- --supplier enderyapi --limit 5 --skip-catalog` çalıştır.

---

## Phase 2: Foundational — Blocking Prerequisites

Tüm 3 user story'nin paylaştığı zemin: data layer + format helper'lar + route sabitleri + zod schema.

- [X] T003 [P] Create `lib/format/date.ts` — export `formatTrDate(iso: string): string` using `Intl.DateTimeFormat('tr-TR', { day, month, year })` + `Intl.RelativeTimeFormat('tr-TR')` (per [data-model.md](./data-model.md) §5). Date <7 gün → "X gün önce" / "bugün" / "dün"; sonrası tam tarih.
- [X] T004 [P] Create `lib/format/currency.ts` — export `formatTry(amount: number): string` using `Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' })`. Test: `formatTry(1234.56)` → `"1.234,56 ₺"`.
- [X] T005 [P] Create `lib/validations/order-filter.ts` — export `orderFilterSchema` (zod) + `parseFilter(searchParams)` helper per [contracts/filter-url.md](./contracts/filter-url.md) ve [data-model.md](./data-model.md) §3. zod: `supplier: regex(/^[a-z0-9-]+$/).optional()`, `status: min(1).max(50).optional()`. `parseFilter` invalid → `{}` döner.
- [X] T006 [P] Update `lib/routes.ts` (001'de var) — `ORDER_DETAIL: (id: string) => \`/dashboard/orders/${id}\`` ekle.
- [X] T007 Create `lib/queries/orders.ts` — 4 fonksiyon export et: `listOrders(filter?)`, `getOrderDetail(id)`, `listSuppliers()`, `listDistinctStatuses()` per [contracts/data-queries.md](./contracts/data-queries.md). `createClient()` from `@/lib/supabase/server` kullan (RLS-respecting); numeric → number transform helper'ları (`toOrderTableRow`, `toOrderDetail`) ekle. Types exports: `OrderTableRow`, `OrderDetail`, `OrderDetailItem`, `FilterState`, `SupplierOption` (data-model'a göre).

**Checkpoint**: Foundational tamam — Server Component'lar `listOrders()` çağırabilir, format helper'lar import edilebilir, zod schema parse edebilir. `npx tsc --noEmit` clean kalır.

---

## Phase 3: User Story 1 — Sipariş listesi görünür (P1) 🎯 MVP

**Story goal**: `/dashboard` ekranı sipariş tablosunu render eder; en yeni başta sıralı; TR locale; empty state komut hint'iyle birlikte.

**Independent Test**: QS-01 (tablo render, 5 sipariş görünür) + QS-02 (empty state).

**Dependencies**: Phase 2 tamam.

- [X] T008 [US1] Create `components/features/orders/empty-state.tsx` — Server Component; "Henüz sipariş yok" mesajı + scraper komutu (`<code>`) + opsiyonel copy butonu (Client Component island; basit `navigator.clipboard.writeText`). Per [research.md](./research.md) R-008.
- [X] T009 [US1] Create `components/features/orders/order-row.tsx` — **Client Component** (`"use client"`); props: `OrderTableRow`. `useRouter()` ile satıra tıklama → `router.push(ROUTES.ORDER_DETAIL(id))`. `<tr>` element + cursor-pointer + hover bg + tüm hücreler text-only. Per [research.md](./research.md) R-011.
- [X] T010 [US1] Create `components/features/orders/order-table.tsx` — Server Component; props: `OrderTableRow[]`. Native HTML `<table>` + Tailwind class'lar (rounded border, sticky header, alternate row bg). Boş diziyse `<EmptyState>` render eder. Sütunlar: Sipariş No, Tedarikçi, Durum, Tarih (`formatTrDate`), Tutar (`formatTry`). `<OrderRow>` her satır için.
- [X] T011 [US1] Rewrite `app/(app)/dashboard/page.tsx`:
  - Server Component, `searchParams` prop async
  - Header: "Sipariş Geçmişi" + sipariş sayısı badge
  - `parseFilter(await searchParams)` → `FilterState`
  - `listOrders(filter)` → `OrderTableRow[]`
  - `<OrderTable orders={orders}>` render
  - Mevcut placeholder içeriği sil
  - Metadata: `title: "Dashboard — Eker Ticaret"` (mevcut)
- [ ] T012 [US1] Run [quickstart.md](./quickstart.md) QS-01 in browser: login → `/dashboard` → 5 satır görünür, TR formatlı, en yeni başta. Fill QS-01 result table.
- [ ] T013 [US1] Test empty state (QS-02): geçici `DELETE FROM public.supplier_orders;` → refresh `/dashboard` → empty state + scraper komutu görünür. Sonra `npm run scrape -- --supplier enderyapi --limit 5 --skip-catalog` ile veriyi geri yükle. Fill QS-02 result table.
- [X] T014 [US1] Run `npx tsc --noEmit` ve `npm run build`; clean olmasını doğrula. Build artifacts uyarısı varsa ele al.

**Checkpoint**: US1 MVP done — `/dashboard` sipariş tablosunu render ediyor. Filter yok ama liste kullanılabilir. 007+ feature'lar bunun üzerine kurulabilir.

---

## Phase 4: User Story 2 — Filter: supplier + status (P2)

**Story goal**: Tedarikçi ve durum filtre'leri URL search params üzerinden; "Filtreleri temizle" butonu; URL bookmark'lanabilir.

**Independent Test**: QS-03 (supplier filter), QS-04 (status filter), QS-05 (kombo + temizle).

**Dependencies**: US1 tamam (table render var).

- [X] T015 [US2] Create `components/features/orders/filter-bar.tsx` — **Client Component** (`"use client"`); props: `suppliers: SupplierOption[], statuses: string[], currentSupplier?: string, currentStatus?: string`. İçinde:
  - Tedarikçi `<select>` (option'lar: "Tüm tedarikçiler" + map suppliers)
  - Durum `<select>` (option'lar: "Tüm durumlar" + map statuses)
  - `useRouter` + `useSearchParams` ile `onChange` → `router.push("/dashboard?...")`
  - "Filtreleri temizle" `<Link href="/dashboard">` (sadece herhangi bir filter aktifse görünür)
- [X] T016 [US2] Update `app/(app)/dashboard/page.tsx`:
  - `listSuppliers()` + `listDistinctStatuses()` paralel çağrı (`Promise.all`)
  - `<FilterBar>` render — `currentSupplier` / `currentStatus` filter state'ten gelir
  - Header altına yerleştir (tablo üstüne)
- [ ] T017 [US2] Run [quickstart.md](./quickstart.md) QS-03 (sentetik 2. supplier ekle, filter dene, sonra temizle). Fill QS-03 result table.
- [ ] T018 [US2] Run [quickstart.md](./quickstart.md) QS-04 (status filter; URL'de TR karakter encoded). Fill QS-04 result table.
- [ ] T019 [US2] Run [quickstart.md](./quickstart.md) QS-05 (kombo filter + "Filtreleri temizle"). Fill QS-05 result table.

**Checkpoint**: US2 done. Filter çalışır, URL state korunur, geri butonu doğal.

---

## Phase 5: User Story 3 — Sipariş detayı (P3)

**Story goal**: Sipariş satırına tıklayınca `/dashboard/orders/[id]` sayfası açılır; sipariş başlığı + ürün satırları + toplam.

**Independent Test**: QS-06 (detay), QS-07 (404), QS-08 (data quality flag).

**Dependencies**: US1 tamam (satır tıklama + ORDER_DETAIL route sabit). US2 bağımsız.

- [X] T020 [US3] Create `components/features/orders/order-detail-card.tsx` — Server Component; props: `detail: OrderDetail`. Render:
  - Header: `<h1>Sipariş {orderNo}</h1>`, alt satır: tedarikçi adı, durum (badge), tarih (`formatTrDate`)
  - Ürün satırları tablosu: kod, ad, adet, birim fiyat, satır toplamı (`formatTry`)
  - Footer: "Hesaplanan toplam: X / DB toplam: Y" — eğer fark > 0.01 ⚠ badge "Veri tutarsız" (SC-007)
  - Geri linki: `<Link href={ROUTES.DASHBOARD}>← Sipariş listesine dön</Link>` (Not: filter URL'i bilemez; basit dönüş yeterli)
- [X] T021 [US3] Create `app/(app)/dashboard/orders/[id]/page.tsx` — Server Component:
  - Async params (Next.js 15): `params: Promise<{ id: string }>`
  - `getOrderDetail(id)` → null ise `notFound()`
  - `<OrderDetailCard detail={detail} />` render
  - Metadata: `title: "Sipariş Detayı — Eker Ticaret"`
- [ ] T022 [US3] Run [quickstart.md](./quickstart.md) QS-06: dashboard'da bir satıra tıkla, detay sayfası açılır, item satırları görünür. Fill QS-06 result table.
- [ ] T023 [US3] Run [quickstart.md](./quickstart.md) QS-07: bilinmeyen UUID URL → 404. Fill QS-07 result table.
- [ ] T024 [US3] Run [quickstart.md](./quickstart.md) QS-08: data quality flag — sentetik `UPDATE supplier_orders SET total_amount=9999.99 WHERE order_no='ESP0192194'` sonra detayda ⚠ badge görünür. Geri yükle. Fill QS-08 result table.

**Checkpoint**: US3 done. Sipariş detayı bookmark'lanabilir, 404 davranışı doğru, data quality görünür.

---

## Phase 6: Polish & Cross-Cutting

- [ ] T025 Run [quickstart.md](./quickstart.md) QS-09 (TR karakter render): sentetik status="İptal Edildi" güncellemesi + dashboard refresh + filter testi. Fill QS-09 result table. Geri yükle.
- [ ] T026 Run [quickstart.md](./quickstart.md) QS-10 (performance): DevTools Network tab, `/dashboard` ilk yükleme <2sn. Fill QS-10 result table.
- [X] T027 [P] Run `mcp__supabase__get_advisors({ type: "security" })`; verify zero new findings (bu feature schema değiştirmedi, beklenen: önceki state).
- [X] T028 [P] Run `mcp__supabase__get_advisors({ type: "performance" })`; verify zero new findings.
- [ ] T029 Manuel UI gözden geçirme: tüm metinler TR mi? Hiçbir İngilizce fallback var mı? (FR-016, SC-008). Browser inspect ile çek.
- [X] T030 Run `npm run build` (full production build) — Vercel deploy öncesi build clean olmalı. Eğer Edge runtime hataları varsa fix.
- [X] T031 Append CHANGES log entry `CR-005 — Feature 005-orders-dashboard tamamlandı` to [.docs/CHANGES.md](../../.docs/CHANGES.md). Add any new gotchas to [.docs/dev-gotchas.md](../../.docs/dev-gotchas.md) (örn. Next.js 15 async params, Supabase distinct workaround).
- [ ] T032 Fill final "Toplam doğrulama özeti" table at the bottom of [quickstart.md](./quickstart.md) — SC-001 → SC-008 against actual results.

---

## Dependencies & Story Completion Order

```
Setup (T001-T002)
  └── Foundational (T003-T007)  ← format/queries/validations
        └── US1 (T008-T014)  ← P1 MVP CHECKPOINT
              ├── US2 (T015-T019)  ← Filter
              └── US3 (T020-T024)  ← Detay
                    └── Polish (T025-T032)
```

- **Foundational** her US için şart (lib/queries, lib/format, lib/validations).
- **US1** MVP. T014 sonrası dashboard çalışır.
- **US2** ve **US3** US1'den sonra bağımsız (paralel yapılabilir; US3 satır tıklama bağlamak için US1'in OrderRow component'ini kullanır ama US2'siz de çalışır).
- **Polish** her şeyin sonunda.

## Parallel Execution Opportunities

Tasks marked `[P]`:
- **T003 + T004 + T005 + T006**: Foundational, hepsi farklı dosya — paralel yazılabilir.
- **T027 + T028**: Bağımsız advisor scan'leri.

US2 ↔ US3 paralel (farklı dosyalar):
- US2 (T015 filter-bar.tsx, T016 page.tsx güncelleme) ve US3 (T020 order-detail-card.tsx, T021 [id]/page.tsx) eş zamanlı yapılabilir.

Sequential-only:
- T007 (lib/queries) → T010-T011 (component'lar query'leri tüketir)
- T010 → T011 (page table'ı tüketir)
- T020 → T021 (page detail card'ı tüketir)

## Implementation Strategy

**MVP scope (recommended)**: T001 → T014 (Setup + Foundational + US1). Bu noktada `/dashboard` çalışır + tablo görünür. 007+ feature'lar (fiyat fark, zamlı ürünler) bu temele kurulabilir.

**Incremental delivery**:
1. **Aşama 1 — MVP**: T001 → T014 (~2-3 saat).
2. **Aşama 2 — Filter**: T015 → T019 (~1-2 saat).
3. **Aşama 3 — Detay**: T020 → T024 (~1-2 saat).
4. **Aşama 4 — Polish**: T025 → T032 (~1 saat).

**Total**: ~5-8 saat (spec'teki "3-5 saat" tahmini biraz iyimserdi; gerçekçi 5-8).

## Format Validation

All 32 tasks follow strict checklist format:
- ✅ Checkbox prefix `- [ ]`
- ✅ Task ID (T001-T032)
- ✅ `[P]` marker on parallel-safe tasks (T003-T006, T027-T028)
- ✅ `[US1]` / `[US2]` / `[US3]` story labels in Phase 3-5 only
- ✅ Exact file paths (lib/format/*, lib/queries/*, components/features/orders/*, app/(app)/dashboard/**, quickstart sections)
