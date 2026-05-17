# Research — Phase 0 Decisions

**Feature**: 006-price-changes-dashboard | **Tarih**: 2026-05-17

Bu doküman implementasyondan önce çözülmesi gereken teknik kararları içerir. Her karar: **Decision / Rationale / Alternatives**.

---

## R-001 — Fiyat fark hesaplama mantığı: SQL pencere fonksiyonu (RPC)

**Decision**: `get_price_changes(window_days int DEFAULT 7)` adlı PL/pgSQL RPC fonksiyonu. Postgres `LAG()` pencere fonksiyonuyla her ürünün **son** snapshot'ını ve aynı ürünün **window_days öncesindeki** snapshot'ını karşılaştırır; fiyatı yukarı çıkmış (`new > old`) ürünleri döner.

**Rationale**:
- 100 ürün × 20 snapshot = 2000 satır JS'e çekip tek tek karşılaştırmak: network + memory israfı.
- Postgres pencere fonksiyonu native + indeksli (`price_snapshots (product_id, observed_at DESC)` zaten var).
- RPC `SECURITY INVOKER` ile RLS otomatik dahil; service_role'a sızdırma yok.
- Aynı RPC parametrik (window_days) — UI `?days=N` doğrudan geçirir.
- 005'teki `record_price_observation` RPC deseni reuse edilir.

**Alternatives considered**:
1. **UI tarafında JS hesap**: tüm snapshot'ları çek, `Array.reduce`/`Map` ile grupla. Reddedildi: ağır transfer, n+1 problemi (ürün için her snapshot ayrı sorgu olmaz ama gruplama logic'i client-side karmaşık).
2. **Materialized view**: günlük refresh ile pre-computed. Reddedildi: V1'de overkill, refresh job ek karmaşıklık; window_days parametrik olamaz.
3. **Raw SQL `lib/queries`**: Supabase JS `.rpc()` vs raw — RPC daha temiz + permission granular.

**RPC signature** (taslak):
```sql
CREATE FUNCTION public.get_price_changes(window_days int DEFAULT 7, include_drops boolean DEFAULT false)
RETURNS TABLE (
  product_id uuid,
  supplier_slug text,
  product_code text,
  product_name text,
  old_price numeric,
  new_price numeric,
  old_observed_at timestamptz,
  new_observed_at timestamptz,
  change_pct numeric,
  change_amount numeric,
  last_order_id uuid,
  last_order_no text,
  last_order_at timestamptz
)
LANGUAGE sql SECURITY INVOKER SET search_path = public, pg_temp
AS $$ ... $$
```

Detayı [contracts/data-queries.md](./contracts/data-queries.md) §3.

---

## R-002 — Tüm UI Server Component, sparkline da SVG-Server

**Decision**: 005 desenini sürdür — `/dashboard/price-changes`, `/dashboard/products/[id]` Server Components. URL search params (?days=N, ?showDrops=1) state taşır. `WindowFilter` (days dropdown) Client island. Sparkline tamamen SVG, server'da render (no interactivity).

**Rationale**:
- RSC bundle küçük + RLS-respecting cookie-session direkt çalışır.
- Sparkline V1'de hover/tooltip yok → JS gerekmiyor.
- 005'te kanıtlandı: filter URL'de → bookmark, geri butonu, share-able.

**Alternatives considered**:
1. **Client-rendered chart (recharts)**: ek 50kB bundle, V1 ROI düşük. Reddedildi.
2. **react-spring/d3**: overkill. Reddedildi.
3. **Sparkline'ı CSS-only (background-gradient)**: temsil zayıf, reddedildi.

**Sparkline contract**:
```ts
type SparklinePoint = { observedAt: string; price: number };
type Props = {
  points: SparklinePoint[];      // 2+; <2 ise grafik yerine "—" render edilir
  width?: number;                 // default 120
  height?: number;                // default 32
  className?: string;
};
```
Server-only render; ~30 satır SVG. Min/max normalize, polyline.

---

## R-003 — Schema migration stratejisi: 2 küçük migration + 1 RPC migration

**Decision**: Üç ayrı migration:
1. `add_vat_rate_to_products.sql` — `products.vat_rate NUMERIC(5,4) DEFAULT 0.20`
2. `extend_price_snapshots_with_components.sql` — `price_snapshots`'a `unit_price_with_vat NUMERIC(10,2)`, `list_price NUMERIC(10,2) NULL`, `discount_text TEXT NULL`, `source TEXT NOT NULL DEFAULT 'catalog'`
3. `create_get_price_changes_rpc.sql` — RPC fonksiyonu

**Rationale**:
- Küçük, fokuslu migration'lar — rollback kolay.
- Her migration kendi test edilebilir.
- 003/004 deseni: migration başına bir konu.

**Alternatives considered**:
1. **Tek büyük migration**: `006_price_changes_schema.sql`. Reddedildi: rollback granular değil, code review zor.
2. **`price_snapshots.unit_price` semantiğini değiştir** (mevcut KDV hariç tutuyordu — değişikliği KDV dahil yap): kırıcı değişiklik, 003 schema fonksiyonu (`record_price_observation`) ve mevcut data'yı bozar. Yerine **yeni kolon ekle** + eski `unit_price` deprecated (V2'de drop).

**Mevcut `price_snapshots.unit_price`'a ne olacak?**
- V1'de **dokunmuyoruz** (003'te boş zaten, sipariş scrape'i bu tabloyu doldurmuyor henüz).
- Yeni catalog scrape **`unit_price_with_vat`'a yazacak** (canonical takip değişkeni).
- Eski `unit_price`'a NULL-able olduğu için yazılması zorunlu değil; catalog scrape isteğe bağlı doldurabilir (KDV hariç fiyat, audit için).
- V2'de eski kolon drop edilebilir; şu an migration'da semantik karışmasını önlemek için yeni kolon adı net (`unit_price_with_vat`).

---

## R-004 — Catalog scraper adapter pattern genişletmesi

**Decision**: `lib/scraper/types.ts` içindeki `Adapter` interface'e şu method eklenir:

```ts
scrapeCatalog(ctx: ScrapeContext, productCodes: string[]): Promise<CatalogScrapeResult[]>;

type CatalogScrapeResult = {
  productCode: string;
  productName?: string;
  brand?: string;
  listPrice: number | null;
  discountText: string | null;
  unitPriceExclVat: number;
  vatRate: number;          // 0.20 = %20
  unitPriceWithVat: number; // hesaplanmış (Number(toFixed(2)))
  error?: { mode: FailureMode; message: string };
};
```

`Enderyapi` adapter'ı bu method'u implement eder; PoC'tan farklı olarak **ürün detay sayfası** URL pattern'ını keşfeder (Senaryo: `/urun-detay/<code>` veya `?productCode=` query — keşif scraper geliştirme sırasında, headed mode'da yapılır).

**Rationale**:
- 004 adapter mimarisi (data extraction layer vs DB writer layer ayrımı) korunur.
- Catalog scrape session paylaşımı: aynı Playwright `browser` + `page` order scrape ile ortak; login bir kere yapılır.
- Error handling: tek ürün fail → `error` field; orchestrator devam eder.

**Alternatives considered**:
1. **Adapter'a 5 ayrı method (getListPrice, getDiscount, …)**: gereksiz parçalı, atomicity yok. Reddedildi.
2. **Sayfa scrape'i ortak helper'a, adapter sadece selector'lar**: önümüzdeki tedarikçiler için cazip ama V1 erken optimizasyon. Reddedildi.
3. **Catalog scrape ayrı script, login kodu copy-paste**: 004 mimarisini boşa düşürür. Reddedildi.

---

## R-005 — Catalog scrape CLI orkestratör: ayrı dosya

**Decision**: `scripts/scrape/catalog.ts` ayrı orchestrator. `run.ts`'tan bağımsız çağrılır:

```bash
npm run scrape:catalog -- --supplier enderyapi --limit 20
npm run scrape:catalog -- --supplier enderyapi --only-stale 24    # 24sa eskiyse refresh
```

CLI args:
- `--supplier <slug>` (zorunlu)
- `--limit <n>` (varsayılan: products tablosundaki tüm ürünler, max 200)
- `--only-stale <hours>` (varsayılan: yok; verirse son snapshot'tan N saat geçenler)
- `--product-code <code>` (tek ürün test)

**Rationale**:
- run.ts (sipariş scrape) ile catalog scrape concerns ayrı; tek dosyada flag dağılımı karmaşık.
- Aynı `Adapter` interface'i kullandığı için DRY korunur.
- Cron 008'de iki ayrı GitHub Action job: sipariş scrape (haftalık) vs catalog scrape (günlük) — birbirini bloklamasın.

**Alternatives considered**:
1. **Tek run.ts + `--mode orders|catalog` flag**: flag dağılımı genişler. Reddedildi.
2. **Ortak orchestrator + mode method**: aynı kapsama düşer. Reddedildi.

---

## R-006 — products tablosu doldurma stratejisi

**Decision**: İki yol:
1. **Otomatik**: 004 sipariş scraper'ı zaten `order_items.product_code` yazıyor; bu kodlar için catalog scrape başlamadan önce `products` tablosunda upsert kontrolü yapılır (yoksa minimal kayıt eklenir: code + supplier_id + ad).
2. **Catalog scrape sırasında**: catalog detay sayfasından parse edilen `productName`, `brand`, `vat_rate` ile `products` UPDATE edilir.

**Rationale**:
- Halil manuel ürün eklemiyor — siparişten geliyor.
- Catalog scrape sadece sipariş kanalından gelen ürünleri tarıyor (V1 scope).
- V2'de "tüm katalog tarama" eklenebilir.

**Alternatives considered**:
1. **Halil manuel ürün ekler**: kullanıcı yükü, MVP'de gereksiz. Reddedildi.
2. **Kataloğun tamamını tara**: 10k+ ürün → free tier'ı zorlar, performans. V1'de reddedildi.

---

## R-007 — Snapshot idempotency: aynı gün aynı ürün için tek satır mı?

**Decision**: **Hayır, her scrape koşumu yeni satır yazar** (timestamp UNIQUE değil). Birden fazla scrape aynı gün = birden fazla snapshot. UI tarafında "son N gün içinde max/min" tutarken bu sorun değil.

**Rationale**:
- Audit: günde 3 kez scrape edip sadece 1 değer tutmak değişikliği anlık yakalayamaz.
- Storage maliyeti minimal (500 ürün × günde 1 scrape × 365 gün = 182k satır/yıl ≈ 30 MB — free tier'da rahat).

**Alternatives considered**:
1. **Aynı gün için UPSERT (PK product_id + DATE(observed_at))**: ilk değer "sabit" gibi davranır, gün içi değişiklik kaybolur. Reddedildi.
2. **Sadece değer değiştiyse yaz**: cazip ama R-001 RPC `LAG()` doğru çalışmaz (eksik veri). Reddedildi.

**Not**: V2'de retention policy: 90 günden eski snapshot'ları haftalık özet'e indirgemek mümkün. Şu an dokunmuyoruz.

---

## R-008 — Sparkline veri kaynağı: her ürün için ayrı sorgu mu, tek toplu mu?

**Decision**: Liste sayfası (`/dashboard/price-changes`) tüm ürünler için sparkline DEĞİL gösterir — sadece eski/yeni rakamları. Sparkline **sadece ürün detay sayfasında** gözükür. Bu sayede liste sayfası tek RPC çağrısı (`get_price_changes`); detay sayfası `listProductSnapshots(productId)` ek sorgu.

**Rationale**:
- 50 ürünlü liste için 50 sparkline = 50 ek sorgu veya bir karmaşık subquery. V1'de gereksiz.
- "Tek bakışta zam gör" use-case için liste yeterli; eğilim merakı tıklayınca detayda.

**Alternatives considered**:
1. **Liste'de sparkline**: UX güzel ama performans + karmaşıklık. V2 nice-to-have. Reddedildi.

---

## R-009 — TR locale yüzde format helper

**Decision**: `lib/format/percent.ts` — `formatTrPercent(0.125)` → `"+%12,5"` (3 ondalık değil, max 2). 0 için `"%0"`. Negatif için `"-%X,Y"` (signed: TR genelde "%-X" yerine "-%X").

**Rationale**:
- Native `Intl.NumberFormat({ style: 'percent', signDisplay: 'exceptZero' })` denenir — TR'de "%-X" formatı çıkıyor (signe doğru), `+%X` için manuel ek (Intl `signDisplay: 'always'` bunu vermiyor TR'de).
- Tek-yönlü kontrol gerek; minimal native helper yazılır.

**Alternatives considered**:
1. **Sadece `Intl`**: signed format tam istediğimiz gibi gelmiyor (TR locale specific). Reddedildi.
2. **date-fns / numeral.js**: bundle ağır. Reddedildi.

---

## R-010 — RPC dönüş kümesi nasıl gruplanır: ürün başına 1 satır

**Decision**: `get_price_changes` her **ürün için 1 satır** döner (son snapshot vs eşik snapshot). Aynı ürün için birden fazla snapshot var olsa bile UI'da tek satır.

**Rationale**:
- Liste anlamı: "şu ürünler zamlandı". Tek ürün için birden fazla zam satırı UI gürültüsü.
- Detay sayfası tarihçeyi tüm sayıyla gösterir.

**Implementation**:
```sql
WITH ranked AS (
  SELECT
    ps.product_id,
    ps.observed_at,
    ps.unit_price_with_vat AS price,
    ROW_NUMBER() OVER (PARTITION BY ps.product_id ORDER BY ps.observed_at DESC) AS rn
  FROM public.price_snapshots ps
  WHERE ps.observed_at >= NOW() - (window_days || ' days')::interval
),
latest AS (SELECT product_id, observed_at, price FROM ranked WHERE rn = 1),
oldest AS (SELECT DISTINCT ON (product_id) product_id, observed_at, price FROM ranked WHERE rn > 1 ORDER BY product_id, observed_at ASC)
SELECT ... -- JOIN latest + oldest + products + last_order_lookup
```

`rn > 1 ORDER BY observed_at ASC` ile "pencere içindeki **ilk** snapshot" oldest olarak alınır; latest "son" snapshot. Fark = latest - oldest.

**Edge**: Pencere içinde sadece 1 snapshot varsa (ilk scrape) → o ürün liste'de **gözükmez** (karşılaştırma yok). Empty state mantığı: > 0 ürün varsa liste, yoksa "yeterli geçmiş yok".

**Alternatives considered**:
1. **Ürün için tüm zam adımlarını ayrı satır göster**: gürültülü, V1'de gereksiz. Reddedildi.

---

## R-011 — Sipariş geçmişi cross-link: ürün detay sayfasından siparişe, sipariş detayından ürüne

**Decision**:
- **Ürün detay → sipariş listesi**: `/dashboard/products/[id]` altında "Bu ürünün geçtiği siparişler" — `order_items` JOIN `supplier_orders`. Server query.
- **Sipariş detay → ürün detay**: 005'in `OrderDetailCard`'ında her item satırının `productCode` veya `productName` linkini `/dashboard/products/<id>` yap. Bu **005'in revizyon değil**, sadece component'e link prop'u ekleme. Mümkün değilse (product_id resolve etmek gerekiyor `order_items`'ten doğrudan ID yok) — minimal genişletme.

**Rationale**:
- "Bu ürünü daha önce kaç defa hangi siparişte aldın" gözlemi Halil için kritik (USP).
- 005'in `OrderDetailCard` revize edilir ama küçük değişiklik (1-2 satır).

**Implementation note**: `order_items` table'ında `product_id` foreign key olmalı (003'te eklendi mi kontrol — yoksa migration eklenir). Hızlı kontrol:

```sql
-- Eğer yoksa: ALTER TABLE order_items ADD COLUMN product_id uuid REFERENCES products(id) ON DELETE SET NULL;
-- 004 scraper'ı product_id'yi populate eden bir lookup eklemeli (catalog scrape sırasında upsert + back-fill)
```

Bu kontrol [data-model.md](./data-model.md) §6'da netleşecek.

**Alternatives considered**:
1. **Cross-link yok**: Halil sipariş geçmişiyle fiyat değişikliğini bağlayamaz, USP kaybolur. Reddedildi.

---

## R-012 — RLS politikaları: yeni kolonlar için ek policy gerekiyor mu?

**Decision**: **Hayır**. `products` ve `price_snapshots` tabloları 003'te zaten `(select auth.uid()) IS NOT NULL` SELECT policy'sine sahip; kolonlara INSERT/UPDATE üzerinde service_role grant verildi (004 fix). Yeni kolonlar otomatik kapsam dahilinde — RLS row-level çalışır, column-level değil.

**Rationale**:
- Postgres RLS row-level granularity; ek kolon kontrolü gerekmiyor.
- Service_role bypass'ı zaten var (catalog scraper için).
- Authenticated user (UI) tüm row'ları okur (tek kullanıcı, sahibi).

**Verification (Phase 1)**:
- Supabase advisor'da yeni warning olmamalı.
- Migration sonrası RLS hâlâ ENABLED kontrolü.

---

## R-013 — Empty state hierarchy

**Decision** (UX):
- Hiç snapshot yok (catalog scrape hiç çalışmamış): "Henüz fiyat verisi yok. `npm run scrape:catalog -- --supplier enderyapi` komutu ile başlayın." (005 empty state desenine benzer)
- En az 1 snapshot ama tek (karşılaştırma için yetersiz): "Karşılaştırma için en az 2 farklı tarihte snapshot gerekli. Birkaç gün sonra tekrar deneyin."
- 2+ snapshot ama pencerede değişiklik yok: "Son N günde fiyat değişikliği yok." (`showDrops` aktifse "fiyat düşüşü de yok").
- Pencere param geçersiz: silent fallback to default 7; URL temizlenmez (kullanıcının yazdığı korunur).

**Rationale**: Empty state'lerin granular olması Halil için yol gösterir; "boş tablo" demek "scrape çalıştır" demektir.

---

## R-014 — Performance budget

**Decision**:
- `/dashboard/price-changes`: First Load JS < 110 kB (Server Component, sparkline yok).
- `/dashboard/products/[id]`: First Load JS < 115 kB (sparkline SVG var ama Server).
- RPC sorgu: 1k snapshot × 200 ürün için < 200ms (indeksli pencere fonksiyonu).
- Catalog scrape: ürün başına ortalama 4-6sn (page load + parse); 20 ürün = ~100sn, < 3 dk hedefi.

**Indeks gereksinimleri** (003'te `price_snapshots (product_id, observed_at DESC)` var; doğrulama: `EXPLAIN ANALYZE` Faz 1'de).

---

## Özet karar matrisi

| # | Konu | Karar |
|---|------|-------|
| R-001 | Fiyat fark hesap | SQL RPC `get_price_changes(window_days)` |
| R-002 | UI render strategy | Server Components + URL params (005 deseni) |
| R-003 | Schema migration | 3 küçük migration (vat_rate, snapshot kolonları, RPC) |
| R-004 | Catalog scraper | `Adapter.scrapeCatalog()` method eklenir |
| R-005 | CLI orchestrator | `scripts/scrape/catalog.ts` ayrı dosya |
| R-006 | products doldurma | Sipariş scrape upsert + catalog scrape enrich |
| R-007 | Snapshot idempotency | Aynı gün birden fazla snapshot OK |
| R-008 | Sparkline | Sadece ürün detayda, liste'de yok |
| R-009 | Yüzde format | `formatTrPercent` helper (signed) |
| R-010 | RPC dönüş | Ürün başına 1 satır |
| R-011 | Cross-link | order_items.product_id FK + iki yönlü navigation |
| R-012 | RLS | Yeni policy yok (mevcut row-level kapsayıcı) |
| R-013 | Empty state | 4 farklı durum + yol gösterici metin |
| R-014 | Performance | < 110 kB First Load, < 200ms RPC, < 3 dk scrape |
