# Research — Phase 0

**Feature**: Zamlanan Ürünler — Son Sipariş Bazlı Birikimli Zam Takibi
**Date**: 2026-06-20

---

## R-001: KDV uyumu (kritik)

**Soru**: Karşılaştırılan iki değer aynı KDV bazında mı?

**Bulgular**:
- `order_items.unit_price_at_order` = sipariş anındaki **KDV hariç net** takip değeri (006 KDV modeli + 010 yedekler kararı).
- `price_snapshots.unit_price` = catalog scrape'inden gelen **KDV hariç net** birim fiyat (009 `writePriceSnapshot` adapter pattern + DB column).
- `price_snapshots.unit_price_with_vat` = KDV dahil değer (ek kolon, opsiyonel).

**Decision**: Karşılaştırma her iki tarafta da KDV hariç (`unit_price_at_order` vs `unit_price`). Hesaplama, division, vat_rate dahil etme gerekmez. Aynı baz.

**Rationale**: 006/009/010 kararları proje genelinde tutarlı — "takip değeri her zaman KDV hariç". Migration veya hesaplama eklemek gereksiz karmaşıklık olur.

**Alternatives considered**:
- ❌ "KDV dahil karşılaştır" — UI'da tedarikçi-özel fiyat yansıması daha az anlamlı; proje pattern dışına çıkar.
- ❌ "Operatör KDV switch'i" — gereksiz UI karmaşası; tek karar yeterli.

---

## R-002: SQL function vs view vs client-side hesaplama

**Soru**: Karşılaştırma mantığı nereye gelir?

**Decision**: PostgreSQL function (RPC, mevcut `get_price_changes` pattern'i devamı).

**Rationale**:
- DB-side aggregation (DISTINCT ON, JOIN) Supabase server-side cache + index avantajı sağlar.
- Mevcut `get_price_changes` RPC pattern'i ile uyumlu; `lib/queries/price-changes.ts` minimum değişikle çalışır.
- Client-side hesaplama 600+ order_items + 800+ snapshots fetch gerektirir — bandwidth ve render maliyeti.

**Alternatives considered**:
- ❌ **Materialized view**: Refresh kuralları karmaşıklaşır (catalog scrape her saatte birikiyor → manuel refresh gerekirdi). Gerçek-zamanlı yansıma önemli.
- ❌ **Regular view**: Performans muhtemel hızlı ama parametre (supplier_slug filter, min_change_pct) push-down olmaz; function imza esnek.
- ❌ **Client-side**: 1500+ satır JSON transfer + JS hesaplama; mobile/yavaş ağda kötü.

---

## R-003: Eski RPC `get_price_changes`'in akıbeti

**Soru**: Eski RPC silinsin mi, paralel kalsın mı, drop edilsin mi?

**Bulgular**: `grep -r "get_price_changes" lib/ app/ components/` → tek caller `lib/queries/price-changes.ts`.

**Decision**: Eski RPC'yi migration'da `DROP FUNCTION IF EXISTS`. Yeni function adı `get_price_changes_v2`. Caller direkt yeni adı kullanır.

**Rationale**:
- Backward compat'a gerek yok (tek caller).
- "v2" suffix audit log gerektirir ama explicit; ileride v3 ihtiyacı olsa naming convention belli.
- Drop yapılırsa schema temiz kalır.

**Alternatives considered**:
- ❌ `CREATE OR REPLACE FUNCTION get_price_changes` — return type değişiyor (`window_days` parametresi kalkıyor); PostgreSQL ALTER izin vermez → drop+create gerekir → adı değiştirmek daha okunaklı.
- ❌ Adı korumak: `get_price_changes(supplier_slug text, min_change_pct numeric)` — function overload Supabase JS client tarafında confusing.

---

## R-004: "Bugünkü fiyat" tanımı — en son snapshot mı, en taze N güne mi?

**Soru**: Snapshot 60 gün önce alındıysa "bugünkü fiyat" kabul edilir mi?

**Decision**: Snapshot ne kadar eski olursa olsun, **en son** `price_snapshots` kaydı "bugünkü fiyat" kabul edilir.

**Rationale**:
- Catalog scrape saatlik cron ile günde 1 kez koşar (007); aktif tedarikçiler için snapshot her gün taze.
- Tedarikçi belirsiz süreyle catalog'da fiyat değiştirmese de "son gözlenen fiyat" karşılaştırma için doğrudur.
- UI'da `current_price_captured_at` alanı operatöre "ne kadar taze" bilgisini iletir.

**Alternatives considered**:
- ❌ "Son 7 gün içindeki snapshot" — keyfi pencere; ürün eski olduğu için son scrape eski de olabilir.
- ❌ "Snapshot 30+ gün eski → bilinmiyor" — yanlış sinyal: gerçekten zam var ama sadece eski.

**Note**: Edge case — snapshot tarihi `last_ordered_at`'tan ÖNCE ise (sipariş daha sonra atıldı) → snapshot kullanılmaz (mantıken son sipariş anındaki fiyatı zaten `unit_price_at_order` taşıyor). Spec edge case'inde belirtildi.

---

## R-005: Snapshot eksik / null durumu

**Soru**: Bir ürün için hiç `price_snapshots` yoksa nasıl render edilir?

**Decision**: Liste satırı görünür ama `current_price = NULL`, `change_pct = NULL`, `change_amount = NULL`. Frontend, NULL gördüğünde rozet + "bilinmiyor" gösterir. Min-zam % filtresi aktifse bu satırlar **hariç tutulur** (yüzdesi bilinemediği için filtreye anlamlı dahil olamaz).

**Rationale**:
- FR-007 + SC-005: operatör veri eksikliğini "zam yok" olarak yorumlamamalı.
- Filtre interaction: "%5+" diyen operatör eksik veriyi de listede görmek istemez (gürültü). Default "Tümü" seçili olunca eksikler görünür.

**Alternatives considered**:
- ❌ Eksik satırları her zaman hariç tut — operatör görmüyor → hatalı tam liste algısı.
- ❌ "Belirsiz" alanı %0 kabul et — yanlış filtre davranışı.

---

## R-006: Frontend filter state — URL param vs client state

**Soru**: Filtre state nerede tutulur?

**Decision**: URL query parametresi olarak (`?supplier=<slug>&min=5`). Server Component sayfayı yeniler.

**Rationale**:
- 005/006'da mevcut filtre pattern (sipariş listesi `?supplier=&status=`) URL bazlı; tutarlılık.
- Operatör URL'yi yer imine koyabilir, bookmark/paylaşım çalışır.
- Server-side fetch, dataset minimum trafik.

**Alternatives considered**:
- ❌ Client state (Zustand) — sayfa yenilenince filtre kaybolur.
- ❌ Hidden form POST — gereksiz boilerplate.

---

## R-007: Sıralama mantığı

**Decision**: Default `change_pct DESC NULLS LAST`. Operatör sıralama seçeneği UI'da chip/dropdown ile değiştirebilir:
- Zam % ↓ (default)
- Zam TL ↓
- Stok yaşı ↓ (en uzun rafta olan üstte)
- Son alış tarihi ↑ (en eski alış üstte)

**Rationale**: "En kritik zam" varsayılan olarak üstte; operatör operasyonel önceliğini değiştirebilir.

**Alternatives considered**:
- ❌ Default "Stok yaşı" — operatör eski stoğa zaten dikkat ediyor; zam yüzdesi daha ön bilgi.
- ❌ Sıralama yok — büyük dataset'te kullanışsız.

---

## R-008: "Zam tarihçesi" (P3) — V1'de mi V2'de mi?

**Decision**: V1 sonrası iterasyona ertelenir. tasks.md'de P3 olarak işaretlenir; opsiyonel.

**Rationale**:
- Spec FR-009 P3 olarak işaretlendi.
- Implementation: ek RPC veya alt-sorgu + custom timeline component (~80 satır) gerekir. Mevcut feature için kritik değil.
- Operatör değer talep ederse 013 olarak ayrı feature.

---

## Open Questions

Yok — tüm kararlar resolved.
