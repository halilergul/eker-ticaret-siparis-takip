---

description: "Task list — Feature 012: Zamlanan Ürünler (son sipariş bazlı zam takibi)"
---

# Tasks: Zamlanan Ürünler — Son Sipariş Bazlı Birikimli Zam Takibi

**Input**: Design documents from `/specs/012-price-changes-rev/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅
**Tests**: Test task'ları YOK (proje pattern'i — manual smoke + DB doğrulama)
**Organization**: Phase 1 setup; Phase 2 foundational (RPC migration tüm hikayelere blok); Phase 3-5 user stories; Phase 6 polish.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Different files / no dependency → parallel
- **[Story]**: US1 / US2 / US3 / US4
- File paths absolute (repo-relative)

---

## Phase 1: Setup

**Amaç**: Branch + sözleşmeler hazır. Çoğu zaten Phase 0/1 sırasında yapıldı.

- [X] T001 Branch oluşturuldu: `012-price-changes-rev`
- [X] T002 Spec + plan + research + data-model + contracts + quickstart yazıldı + commit edildi (a... ve 2101427)

---

## Phase 2: Foundational (Blocking)

**Amaç**: SQL function ve TypeScript tipleri tüm user story'lere blok; önce burası tamam olmalı.

⚠️ **CRITICAL**: User story implementation'ları bu phase tamamlanmadan başlayamaz.

- [X] T010 Migration dosyası yazıldı: [supabase/migrations/20260620100000_get_price_changes_v2.sql](supabase/migrations/20260620100000_get_price_changes_v2.sql)
- [X] T011 Migration uygulandı (Supabase MCP). DB doğrulama: **667 toplam satır** (231 snapshot'lı + 436 eksik); top zamlanan ürünler gerçekçi (Yedekler İZONET %184, KALIN ZEMİN %180, YUNUS MİX %149)
- [X] T012 Eski `get_price_changes` silindi ✓ (sadece `get_price_changes_v2` mevcut)

**Checkpoint**: SQL altyapısı hazır — `lib/queries/price-changes.ts` yeni RPC'yi çağırabilir.

---

## Phase 3: User Story 1 — Son alımdan bu yana zammı görme (Priority: P1) 🎯 MVP

**Goal**: Operatör sayfayı açtığında her zamlanan ürünün son sipariş anındaki birim fiyatı + bugünkü tedarikçi fiyatı + delta'sını tek bakışta görür.

**Independent Test**: Yedekler tedarikçisindeki bilinen bir zamlanan ürün için DB sorgusu ve dashboard satırı eşleşmeli (son alış fiyatı + bugün + delta).

### Implementation for User Story 1

- [X] T020 [US1] zod schema yeniden yazıldı (windowDays/includeDrops kaldırıldı; supplier/min/sort eklendi) — [lib/validations/price-changes-filter.ts](lib/validations/price-changes-filter.ts) + [lib/constants/price-changes.ts](lib/constants/price-changes.ts)
- [X] T021 [US1] `lib/queries/price-changes.ts` yeniden yazıldı: `PriceComparisonRow` tipi, `get_price_changes_v2` RPC; database.types.ts MCP ile regenerate edildi — [lib/queries/price-changes.ts](lib/queries/price-changes.ts)
- [X] T022 [US1] TypeScript check temiz (0 hata)
- [X] T023 [US1] Table + row güncellendi (yeni sütunlar: Son Alış [tarih+fiyat], Bugün, Δ%, Δ₺) — [components/features/price-changes/price-change-table.tsx](components/features/price-changes/price-change-table.tsx), [price-change-row.tsx](components/features/price-changes/price-change-row.tsx)
- [X] T024 [US1] Page güncellendi: yeni filter parser + suppliers fetch + subtitle "Son siparişinizden bu yana..." — [app/(app)/dashboard/price-changes/page.tsx](app/(app)/dashboard/price-changes/page.tsx)
- [ ] T025 [US1] Lokal smoke: `npm run dev` → tarayıcıda manuel kontrol (kullanıcı testi)

**Checkpoint**: US1 tek başına MVP olarak teslim edilebilir. Operatör Halil dashboard'da gerçek iş kuralı ile zamları görüyor.

---

## Phase 4: User Story 2 — Pencere filtresi kaldırılması + yeni filtre bar (Priority: P1)

**Goal**: "Son N gün" toggle yok; yerine tedarikçi dropdown + min-zam % chip preset.

**Independent Test**: Sayfa açıldığında "Son 30/60/90 gün" toggle/buton görünmez; tedarikçi seçimi ve min% chip URL parametresinde korunur.

### Implementation for User Story 2

- [X] T030 [US2] `PriceChangesFilterBar` yazıldı: glass pill row + tedarikçi dropdown + min% chip preset + sıralama dropdown + Temizle butonu — [components/features/price-changes/price-changes-filter-bar.tsx](components/features/price-changes/price-changes-filter-bar.tsx)
- [X] T031 [US2] `window-filter.tsx` silindi
- [X] T032 [US2] Page'de `PriceChangesFilterBar` aktif, suppliers prop geçirildi
- [ ] T033 [US2] Lokal smoke (T025 ile birleştirildi)

**Checkpoint**: US2 tamamlanınca eski pencere kavramı tamamen kaldırıldı; yeni filtre paneli operatör için pratik.

---

## Phase 5: User Story 3 — Snapshot eksik durumu rozeti (Priority: P2)

**Goal**: Bir ürün için `current_price` NULL ise satır listede kalır + "Bugünkü fiyat bilinmiyor — tedarikçi catalog'unda olmayabilir" rozeti.

**Independent Test**: DB'de sipariş kalemi olan ama price_snapshots'ta kaydı olmayan bir ürün için dashboard satırı görünür + rozet gösterilir.

### Implementation for User Story 3

- [X] T040 [US3] Row component'inde amber rozet ("Bilinmiyor") + tooltip implementi — [components/features/price-changes/price-change-row.tsx](components/features/price-changes/price-change-row.tsx)
- [X] T041 [US3] DB veri var: 436 satır snapshot eksik (önceki sorgu); lokal smoke ile görsel kontrol yapılacak

**Checkpoint**: US3 tamamlanınca operatör eksik veriyi "zam yok" olarak yorumlamaz.

---

## Phase 6: User Story 4 — Zam tarihçesi timeline (Priority: P3) — OPSİYONEL

**Goal**: Her satırda "▼ Zam tarihçesi" linki → o ürün için tüm `price_snapshots` zaman çizelgesi.

**Independent Test**: 3+ snapshot'ı olan bir ürün için timeline genişler ve tarihler + fiyatlar görünür.

> ⚠️ **OPSİYONEL**: V1 sonrası iterasyona ertelenebilir (research.md R-008). Ekipte zaman varsa eklenir.

### Implementation for User Story 4 (opsiyonel)

- [ ] T050 [US4] (opsiyonel) `lib/queries/price-changes.ts`'ye yeni fonksiyon ekle: `listProductSnapshots(productId)` → product için tüm snapshot'ları kronolojik dön — [lib/queries/price-changes.ts](lib/queries/price-changes.ts)
- [ ] T051 [US4] (opsiyonel) Yeni component: `components/features/price-changes/price-history-timeline.tsx` — collapsible row, küçük SVG/CSS zaman çizelgesi — [components/features/price-changes/price-history-timeline.tsx](components/features/price-changes/price-history-timeline.tsx)
- [ ] T052 [US4] (opsiyonel) `price-change-table.tsx` her satıra "▼ Zam tarihçesi" trigger ekle; client-side toggle ile timeline'ı göster/gizle — [components/features/price-changes/price-change-table.tsx](components/features/price-changes/price-change-table.tsx)
- [ ] T053 [US4] (opsiyonel) Lokal smoke: birikimli zam görünür (Şubat → Mayıs → Eylül noktalar zaman çizelgesinde)

**Checkpoint**: US4 atlanırsa Phase 7'ye geç.

---

## Phase 7: Polish & Cross-Cutting

- [ ] T060 [P] Constitution decision log'a 012 satırı ekle: "Zamlanan ürünler pencere kavramı kaldırıldı; son sipariş anı baz" — [.docs/CONSTITUTION.md](.docs/CONSTITUTION.md)
- [ ] T061 [P] CLAUDE.md güncelle: 012 tamamlandı listesinde, "Aktif feature: yok" — [CLAUDE.md](CLAUDE.md)
- [ ] T062 Regresyon kontrolü: dashboard root, settings, sipariş detayı sayfaları görsel olarak değişmedi (smoke check tarayıcıda)
- [ ] T063 Commit + push: tüm değişiklikler 012 branch'ine
- [ ] T064 PR aç: `gh pr create --base master --head 012-price-changes-rev` — title + body (önceki-sonraki sayfa karşılaştırması + DB doğrulama özeti)
- [ ] T065 PR merge: `gh pr merge <pr-num> --squash --delete-branch`
- [ ] T066 Merge sonrası prod doğrulama: `https://siparis.ekerticaret.com.tr/dashboard/zamlanan-urunler` aç → yeni filtre bar + zamlanan ürünler görünüyor

---

## Bağımlılıklar / Yürütme Sırası

```
Phase 2 (T010-T012): Migration ZORUNLU önce
   ↓
Phase 3 (T020-T025): US1 — Foundation üzerinde
   ↓
Phase 4 (T030-T033): US2 — Phase 3'ün filter bar + page güncellemesini ileri taşır
   ↓
Phase 5 (T040-T041): US3 — Phase 3'ün table'ında NULL handling
   ↓
Phase 6 (T050-T053): US4 — OPSİYONEL, atlanabilir
   ↓
Phase 7 (T060-T066): Polish + PR + merge
```

### File-level dependencies

- `price-change-table.tsx` US1 (T023) → US3 (T040) → US4 (T052) — sıralı
- `page.tsx` US1 (T024) → US2 (T032) — sıralı
- `price-changes-filter-bar.tsx` yalnız US2 (T030) — bağımsız
- `price-changes.ts` US1 (T021) → US4 (T050) — sıralı
- `price-changes-filter.ts` yalnız US1 (T020) — bağımsız (sadece US1)

### Parallel opportunities

- T020 ve T030 paralel (farklı dosyalar, US1 vs US2 schema vs component)
- T060 ve T061 paralel (CLAUDE.md vs CONSTITUTION.md)

---

## Implementation Strategy (MVP-first)

**MVP minimum**: Phase 2 + US1 (T010-T025). 7 task. Operatör Halil yeni iş kuralı ile zamlanan ürünleri görür. Pencere kavramı hala UI'da olabilir (sonra US2 ile değiştirilir).

**Tam V1 (önerilen)**: Phase 2 + US1 + US2 + US3 + Polish (T010-T066). US4 atla. ~22 task.

**Tam +**: Tüm 6 phase + US4. ~28 task.

### Önerilen sıra

1. Phase 2 (migration + DB check)
2. Phase 3 US1 (query + table + page) → lokal smoke
3. Phase 4 US2 (filter bar + page) → lokal smoke
4. Phase 5 US3 (NULL handling) → lokal smoke
5. **Karar noktası**: US4 implement mi atla mı?
6. Phase 7 (polish + PR + merge)

---

## Notlar

- Test task'ı yok (proje pattern).
- US1 ve US2 implementation içinde birbirine `page.tsx` üzerinden bağlı — Phase 3 önce US1 işlevselliği teslim eder, Phase 4 filter bar değişikliği ile bütünleşir.
- US3 (P2) ana akış için zorunlu değil; operatör veri eksik ürünleri yorumlama açısından kritik.
- US4 (P3) opsiyonel — birikimli zam ana metrik (delta) zaten teslim ediyor; timeline ekstra detay.
- Migration prod ortama uygulandığında 1-2 saniyelik tutarsızlık olabilir (deploy edilmemiş eski RPC adı arandığı süre); kabul edilebilir (tek kullanıcı).
