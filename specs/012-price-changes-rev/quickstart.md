# Quickstart — Feature 012

**Feature**: Zamlanan Ürünler — Son Sipariş Bazlı Birikimli Zam Takibi
**Date**: 2026-06-20

---

## Önkoşullar

- Branch: `012-price-changes-rev` (oluşturuldu)
- DB: Supabase prod (mevcut). Migration MCP üzerinden uygulanır.
- Node 22+, npm install güncel
- `.env.local` mevcut (Supabase URL + anon key + service role key)

---

## Phase A: Migration uygula

```bash
# 1. SQL function yaz (Supabase MCP apply_migration)
mcp__supabase__apply_migration name="get_price_changes_v2" query="<SQL>"

# 2. Manuel doğrulama (Supabase SQL editor veya MCP execute_sql)
SELECT count(*) FROM public.get_price_changes_v2(NULL, 0, 'change_pct');
# Beklenen: 0+ satır (mevcut DB'de zaten zamlanmış ürünler varsa görünmeli)

SELECT * FROM public.get_price_changes_v2(NULL, 0, 'change_pct') LIMIT 5;
# Beklenen: 14 sütun, change_pct DESC sıralı

# 3. Eski function silinmiş mi?
SELECT pg_get_functiondef('public.get_price_changes'::regproc);
# Beklenen: "function ... does not exist" hatası
```

---

## Phase B: Backend güncelle

### B1. `lib/validations/price-changes-filter.ts`

- `windowDays` ve `includeDrops` kaldır
- `supplierSlug?: string`, `minChangePct?: number`, `sortBy?: "change_pct" | "change_amount" | "days_since" | "last_ordered_at"` ekle
- zod regex ve enum validation

### B2. `lib/queries/price-changes.ts`

- `listPriceChanges` parametresi yeni filter tipini alır
- `supabase.rpc("get_price_changes_v2", { ... })`
- Return tipi `PriceComparisonRow[]` (eski `PriceChangeRow` korunmayabilir)
- `listAnySnapshotCount` fonksiyonu korunur (boş durum messajı için)

### B3. TypeScript check

```bash
npx tsc --noEmit
# Beklenen: 0 hata
```

---

## Phase C: UI güncelle

### C1. Filtre bar component

Yeni dosya: `components/features/price-changes/price-changes-filter-bar.tsx`

- Glass pill row (mevcut FilterBar pattern, 005 ile uyumlu)
- "Tedarikçi" dropdown (4 + Tümü)
- "Minimum zam" chip preset (Tümü / %5+ / %10+ / %25+ / %50+)
- URL query params (`?supplier=&min=`)
- Server-side rerender ile filtreler aktif

### C2. Table component güncelle

`components/features/price-changes/price-change-table.tsx`:

- Satır şablonu:
  - Üst sol: zam % rozeti (kırmızı) + zam TL
  - Üst sağ: tedarikçi etiketi
  - Orta: ürün kodu (küçük, mono) + ürün adı (vurgulu)
  - Alt: "Son alış: 12.09.2025 (282 gün önce) — 38.50 TL/ad"
  - Alt: "Bugün: 56.70 TL/ad — son scrape 3 saat önce" **VEYA** "Bugünkü fiyat bilinmiyor — tedarikçi catalog'unda olmayabilir" rozet
- Empty state: "Henüz zamlanan ürün yok" (mevcut)
- "Hiç snapshot yok" empty state: "Catalog scrape henüz çalışmadı; settings'ten manuel tetikle"

### C3. Sayfa güncelle

`app/(app)/dashboard/price-changes/page.tsx`:

- `WindowFilter` import kaldır
- Yeni `PriceChangesFilterBar` import et + render
- `parsePriceChangesFilter` yeni şema ile
- `PageHeader.subtitle` değişir: "Son siparişinizden bu yana zamlanan ürünler" gibi
- Eski `WindowFilter` dosyasını sil

### C4. Lokal dev test

```bash
npm run dev
# Tarayıcıda: http://localhost:3000/dashboard/zamlanan-urunler
```

**Kontroller**:
- [ ] Filtre bar görünür: tedarikçi dropdown + min chip
- [ ] Default: tüm zamlanan ürünler + snapshot eksik olanlar
- [ ] Tedarikçi seç → sadece o tedarikçi
- [ ] Min %5+ seç → düşük zamlar düşer, snapshot eksik olanlar düşer
- [ ] Bir satırda "Bugünkü fiyat bilinmiyor" rozeti varsa
- [ ] Stok yaşı doğru ("282 gün önce" gibi)
- [ ] Sıralama default zam %↓

---

## Phase D: DB doğrulama

```sql
-- 4 tedarikçi başına satır sayıları
SELECT
  supplier_slug,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE current_price_excl_vat IS NOT NULL) AS with_snapshot,
  COUNT(*) FILTER (WHERE current_price_excl_vat IS NULL) AS missing_snapshot
FROM public.get_price_changes_v2(NULL, 0, 'change_pct')
GROUP BY supplier_slug;

-- En çok zamlanan 10 ürün
SELECT supplier_slug, product_code, product_name,
       last_order_price_excl_vat, current_price_excl_vat,
       round(change_pct * 100, 1) AS pct,
       round(change_amount, 2) AS tl
FROM public.get_price_changes_v2(NULL, 0, 'change_pct')
ORDER BY change_pct DESC NULLS LAST
LIMIT 10;
```

Beklenen: 10 satır, zam yüzdesi azalan.

---

## Phase E: Commit + push + PR

```bash
git add supabase/migrations/ lib/queries/ lib/validations/ \
        components/features/price-changes/ app/\(app\)/dashboard/price-changes/ \
        specs/012-price-changes-rev/
git commit -m "feat(012): zamlanan ürünler — son sipariş bazlı zam takibi"
git push -u origin 012-price-changes-rev

gh pr create --base master --head 012-price-changes-rev \
  --title "feat(012): zamlanan ürünler — son sipariş bazlı zam takibi" \
  --body "..."
```

---

## Phase F: Merge sonrası kontrol

- Vercel auto-deploy (~30 sn)
- `https://siparis.ekerticaret.com.tr/dashboard/zamlanan-urunler` aç
- Tedarikçi filtresi + min% chip çalışıyor
- Mevcut dashboard ve settings sayfaları regresyon yok

---

## Sorun Giderme

### "RPC 404 — function not found"

- Migration uygulanmadı. Supabase MCP `list_migrations` ile teyit et.

### "Tüm satırlarda current_price NULL"

- `price_snapshots` boş veya tüm snapshot'lar son siparişten eski. Catalog scrape çalıştır (`scrape:catalog` veya settings'ten).

### "Filter URL param çalışmıyor"

- Server Component yeniden render etmiyor — `parsePriceChangesFilter` zod validation hata veriyor olabilir; console'a bak.
