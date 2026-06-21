# Implementation Plan: Zamlanan Ürünler — Son Sipariş Bazlı Birikimli Zam Takibi

**Branch**: `012-price-changes-rev` | **Date**: 2026-06-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/012-price-changes-rev/spec.md`

---

## Summary

Mevcut `/dashboard/zamlanan-urunler` sayfasının iş kuralı **snapshot pencere bazından** **son-sipariş-anı bazına** geçer.

- Yeni SQL function (`get_price_changes_v2`): her `(product, supplier)` çifti için son `order_items.unit_price_at_order` ve en son `price_snapshots.unit_price` karşılaştırır; yalnız zamlanan satırları döner (snapshot eksikse `null` döner ama satırı atmaz).
- Yeni filtre paneli: tedarikçi dropdown + min-zam % chip; "Son N gün" pencere kaldırılır; "düşüşleri göster" toggle kaldırılır.
- Tablo satırına: stok yaşı (gün), son alış tarihi+fiyatı, bugünkü fiyat veya "bilinmiyor" rozeti.
- Mevcut RPC `get_price_changes` ve `WindowFilter` component kaldırılır (eski sözleşmeyi kullanan başka caller yok — onaylandı).

Implementation noktaları:
- 1 Supabase migration (new SQL function)
- 1 RPC değişimi (`listPriceChanges` query güncellenir, RPC adı değişir)
- 1 zod schema güncellemesi (filter)
- 2 component refactor (`WindowFilter` → `PriceChangesFilterBar`; `PriceChangeTable` row template)
- Validation: lokal dev server + DB doğrulama (250+ ürün için)

---

## Technical Context

**Language/Version**: TypeScript 5.x strict, Next.js 15 App Router, React 19, Tailwind 4

**Primary Dependencies**: Supabase JS (server client), zod (filter validation), Tailwind, lucide-react (icons)

**Storage**: Supabase Postgres — şema değişikliği yok; sadece yeni SQL function

**Testing**: Manuel quickstart (lokal dev server + tarayıcı smoke); birim test yok (proje pattern)

**Target Platform**: Vercel Edge/Serverless (Next.js App Router), Supabase EU-Central

**Project Type**: Web-fullstack — Server Components + Supabase RPC

**Performance Goals**: Sayfa ilk yükleme < 1sn (SC-004); ~250+ ürün dataset için RPC yanıt < 500ms

**Constraints**:
- RPC body 50ms-300ms aralığında kalmalı (Supabase EU-Central, indexed query)
- Constitution kararı (006): "eşik yok, en küçük değişim bile gösterilir" — default filtre %0
- KDV uyumu: `order_items.unit_price_at_order` = KDV hariç ✓; `price_snapshots.unit_price` = KDV hariç ✓ (proje genelinde tutarlı, hesaplama gerekmez)

**Scale/Scope**: Mevcut DB: 4 tedarikçi × ~250+ products × ~600 order_items × ~800 price_snapshots. Query LIMIT yok.

---

## Constitution Check

*GATE: Pass before Phase 0. Re-check after Phase 1.*

| # | Item | Verdict | Notes |
|---|------|---------|-------|
| 1 | Business logic UI'dan ayrı (lib/queries) | ✅ | `lib/queries/price-changes.ts` zaten ayrı, RPC çağrısı orada |
| 2 | RLS policy zorunlu | ✅ | Mevcut `price_snapshots`/`order_items`/`products` RLS'leri korunur; yeni RPC server-only (Server Component); SECURITY DEFINER kullanılırsa risk |
| 3 | Input validation zod ile | ✅ | `price-changes-filter.ts` zod schema güncellenir |
| 4 | Eşik yok (2026-05-17 kararı) | ✅ | Default filtre tüm zamlar; %5+ chip opsiyonel |
| 5 | KDV modeli (006/009/010) | ✅ | `unit_price` her iki tabloda KDV hariç; hesaplama yok |
| 6 | Tek kullanıcı / RLS basit | ✅ | Auth middleware mevcut; sayfa zaten korumalı route grupta |
| 7 | Türkçe karakter desteği | ✅ | "Yedekler İnşaat" gibi tedarikçi adları test edildi (010) |
| 8 | Anti-goal: e-posta uyarısı yok | ✅ | Spec out-of-scope; sadece dashboard view |

### Gate sonucu: **PASS**

---

## Project Structure

### Documentation (this feature)

```text
specs/012-price-changes-rev/
├── plan.md                              # Bu dosya
├── research.md                          # Phase 0: KDV uyum + RPC vs view + UI pattern kararları
├── data-model.md                        # Phase 1: PriceComparisonRow tipi + RPC kontratı
├── contracts/
│   └── rpc-get-price-changes-v2.md      # Phase 1: SQL function input/output sözleşmesi
├── quickstart.md                        # Phase 1: Lokal smoke + manuel doğrulama akışı
├── tasks.md                             # Phase 2 (/speckit-tasks output)
└── checklists/
    └── requirements.md                  # ✅ 12/12
```

### Source Code (repository root)

```text
supabase/migrations/
└── 20260620100000_get_price_changes_v2.sql        # YENİ

lib/
├── queries/
│   └── price-changes.ts                           # listPriceChanges → yeni RPC, yeni return tipi
└── validations/
    └── price-changes-filter.ts                    # zod schema: windowDays kaldır, minChangePct + supplier ekle

components/features/price-changes/
├── window-filter.tsx                              # SİL
├── price-changes-filter-bar.tsx                   # YENİ (tedarikçi + min%)
└── price-change-table.tsx                         # Row template güncelle (stok yaşı + "bilinmiyor" rozeti)

app/(app)/dashboard/price-changes/
└── page.tsx                                       # Imports + props güncelle
```

**Structure Decision**: Mevcut feature klasör pattern korunur (`components/features/price-changes/`). Yeni filter bar ayrı dosya (mevcut window-filter.tsx silinir; eski sözleşmeyle uyumlu kalmaz çünkü pencere kavramı tamamen değişiyor).

---

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| Eski RPC + yeni RPC paralel | Yok — eski RPC tamamen değiştirilir | "Backward compat" gereksiz: tek caller var (`listPriceChanges`); başka caller yok (grep ile teyit edildi) |

---

## Implementation Phases

| Phase | Output | Status |
|-------|--------|--------|
| Phase 0 | research.md | ⏳ Sıradaki |
| Phase 1 | data-model.md + contracts/ + quickstart.md | ⏳ Phase 0 sonrası |
| Phase 2 | tasks.md (`/speckit-tasks`) | ⏳ |
| Phase 3 | Migration + query + UI implement | ⏳ |
| Phase 4 | Lokal smoke + DB doğrulama | ⏳ |
| Phase 5 | Commit + push + PR + merge | ⏳ |
