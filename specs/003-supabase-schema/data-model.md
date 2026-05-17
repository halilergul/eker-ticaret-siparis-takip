# Data Model — Tedarikçi Sipariş & Fiyat Takibi

**Feature**: 003-supabase-schema | **Tarih**: 2026-05-16

Bu doküman 5 tabloluk schema'nın tablo-by-tablo detayını içerir: alanlar, tipler, kısıtlar, ilişkiler, index'ler. Tam SQL `contracts/schema-sql.md`'dedir; bu doküman okunabilir referans.

---

## Tablolar — özet ER

```text
suppliers (1) ─────< (N) supplier_orders (1) ─────< (N) order_items
    │                                                      │
    │                                                      │ (yumuşak: product_code)
    │                                                      │
    └─< (N) products (1) ─────< (N) price_snapshots        │
                  ▲                                         │
                  └─────────────────────────────────────────┘
                       (supplier_id, code) join key
```

---

## 1. `suppliers`

B2B tedarikçi sitelerinin master kaydı.

| Kolon | Tip | NULL | Default | Notes |
|-------|-----|------|---------|-------|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `slug` | `text` | NO | — | UNIQUE; URL-safe ID (`enderyapi`) |
| `name` | `text` | NO | — | İnsan-okunabilir (`Enderyapi B2B`) |
| `base_url` | `text` | NO | — | Tedarikçi site root URL (`https://b2b.enderyapi.com.tr`) |
| `created_at` | `timestamptz` | NO | `now()` | |
| `updated_at` | `timestamptz` | NO | `now()` | trigger ile güncellenir |

**Constraints**:
- `PRIMARY KEY (id)`
- `UNIQUE (slug)`
- `CHECK (slug ~ '^[a-z0-9-]+$')` — kebab-case lowercase
- `CHECK (base_url LIKE 'http%')` — protokol mevcut

**Indexes**: PK + slug unique zaten yeterli; ek index yok.

**Seed**: 1 satır (`slug='enderyapi'`).

---

## 2. `supplier_orders`

Bir tedarikçideki bir siparişin başlık bilgisi.

| Kolon | Tip | NULL | Default | Notes |
|-------|-----|------|---------|-------|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `supplier_id` | `uuid` | NO | — | FK → `suppliers(id)` ON DELETE RESTRICT |
| `order_no` | `text` | NO | — | Tedarikçinin verdiği sipariş numarası (`ESP018-12345`) |
| `status` | `text` | NO | — | Türkçe metin (`Onaylandı`, `Onay bekliyor`, `İptal`) |
| `ordered_at` | `timestamptz` | NO | — | Sipariş tarihi (tedarikçi sayfasından) |
| `total_amount` | `numeric(14,2)` | NO | — | Toplam tutar |
| `currency` | `text` | NO | `'TRY'` | CHECK (`currency IN ('TRY')`) |
| `notes` | `text` | YES | NULL | Manuel/freeform notlar (V1 için kullanılmaz) |
| `created_at` | `timestamptz` | NO | `now()` | |
| `updated_at` | `timestamptz` | NO | `now()` | trigger ile |

**Constraints**:
- `PRIMARY KEY (id)`
- `FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT` — tedarikçi silinirken siparişler korunur
- `UNIQUE (supplier_id, order_no)` — tedarikçi içinde tekil
- `CHECK (total_amount >= 0)`
- `CHECK (currency IN ('TRY'))`
- `CHECK (length(order_no) > 0)`

**Indexes**:
- `(supplier_id)` — supplier'a göre sıralı listeleme
- `(ordered_at DESC)` — "en yeni siparişler"
- `(supplier_id, ordered_at DESC)` composite — opsiyonel, yukarıdakiler yeterli; eklenmedi

---

## 3. `order_items`

Bir sipariş içindeki tek bir ürün kalemi. `products` ile FK YOK (yumuşak bağlantı `(supplier_id, product_code)`).

| Kolon | Tip | NULL | Default | Notes |
|-------|-----|------|---------|-------|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `order_id` | `uuid` | NO | — | FK → `supplier_orders(id)` ON DELETE CASCADE |
| `product_code` | `text` | NO | — | Tedarikçi ürün kodu (`VDA-M8-PSL`) |
| `product_name` | `text` | NO | — | Sipariş anındaki ürün adı snapshot |
| `quantity` | `numeric(12,3)` | NO | — | Adet (kg, metre vb. ondalık olabilir) |
| `unit_price_at_order` | `numeric(14,2)` | NO | — | Alış birim fiyatı (sipariş anında) |
| `currency` | `text` | NO | `'TRY'` | CHECK |
| `created_at` | `timestamptz` | NO | `now()` | |
| `updated_at` | `timestamptz` | NO | `now()` | trigger ile |

**Constraints**:
- `PRIMARY KEY (id)`
- `FOREIGN KEY (order_id) REFERENCES supplier_orders(id) ON DELETE CASCADE` — sipariş silinirse satırları da silinir
- `UNIQUE (order_id, product_code)` — aynı siparişte aynı ürün kodu tekil
- `CHECK (quantity > 0)`
- `CHECK (unit_price_at_order >= 0)`
- `CHECK (currency IN ('TRY'))`
- `CHECK (length(product_code) > 0)`

**Indexes**:
- `(order_id)` — siparişin satırlarını çekme (FK desteği)
- `(product_code)` — "bu ürün kodu hangi siparişlerde geçti?" sorgusu

---

## 4. `products`

Tedarikçi katalog kaydı. Tek tedarikçi içinde ürün kodu tekildir; aynı kod farklı tedarikçide ayrı satır olur.

| Kolon | Tip | NULL | Default | Notes |
|-------|-----|------|---------|-------|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `supplier_id` | `uuid` | NO | — | FK → `suppliers(id)` ON DELETE RESTRICT |
| `code` | `text` | NO | — | Tedarikçi ürün kodu |
| `name` | `text` | NO | — | En son gözlemde alınan ürün adı |
| `current_unit_price` | `numeric(14,2)` | YES | NULL | En son gözlemde alınan güncel fiyat |
| `last_seen_at` | `timestamptz` | YES | NULL | En son katalog ziyareti zamanı |
| `currency` | `text` | NO | `'TRY'` | CHECK |
| `created_at` | `timestamptz` | NO | `now()` | |
| `updated_at` | `timestamptz` | NO | `now()` | trigger ile |

**Constraints**:
- `PRIMARY KEY (id)`
- `FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT`
- `UNIQUE (supplier_id, code)`
- `CHECK (current_unit_price IS NULL OR current_unit_price >= 0)`
- `CHECK (currency IN ('TRY'))`
- `CHECK (length(code) > 0)`

**Indexes**:
- `(supplier_id)` — supplier'a göre katalog
- `(supplier_id, code)` zaten UNIQUE → join performansı için yeterli

---

## 5. `price_snapshots`

Bir ürünün belirli bir andaki gözlem fiyatı. Append-only; aynı fiyat tekrar gözlemlenirse satır eklenmez (fonksiyon kontrolü).

| Kolon | Tip | NULL | Default | Notes |
|-------|-----|------|---------|-------|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `product_id` | `uuid` | NO | — | FK → `products(id)` ON DELETE CASCADE |
| `captured_at` | `timestamptz` | NO | `now()` | Gözlem zamanı |
| `unit_price` | `numeric(14,2)` | NO | — | Gözlenen birim fiyat |
| `currency` | `text` | NO | `'TRY'` | CHECK |
| `created_at` | `timestamptz` | NO | `now()` | |

**Constraints**:
- `PRIMARY KEY (id)`
- `FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE`
- `CHECK (unit_price >= 0)`
- `CHECK (currency IN ('TRY'))`

**Indexes**:
- `(product_id, captured_at DESC)` composite — "ürünün son N fiyat snapshot'ı" sorgusu

**Not**: `updated_at` YOK; snapshot immutable.

---

## Trigger: `set_updated_at()`

```text
fonksiyon: PL/pgSQL
body: NEW.updated_at := now(); RETURN NEW;
bağlandığı tablolar: suppliers, supplier_orders, order_items, products
event: BEFORE UPDATE
```

`price_snapshots` `updated_at` taşımıyor → trigger bağlanmıyor.

---

## RPC Fonksiyon: `record_price_observation()`

İmza:

```text
record_price_observation(
  p_supplier_id  uuid,
  p_product_code text,
  p_product_name text,
  p_unit_price   numeric,
  p_captured_at  timestamptz default now()
) returns uuid    -- product_id
```

**Davranış**:
1. `(p_supplier_id, p_product_code)` ile `products`'tan satır bul; yoksa insert et (`name`, `current_unit_price`, `last_seen_at` ilk değerlerle).
2. Varsa: `current_unit_price` ile `p_unit_price` karşılaştır.
   - **Farklı**: `price_snapshots`'a yeni satır ekle; `products.current_unit_price`, `products.name`, `products.last_seen_at` güncelle.
   - **Aynı**: `price_snapshots`'a ekleme YAPMA; sadece `products.name`, `products.last_seen_at` güncelle.
3. `product_id` döner.

**Notlar**:
- `name` her zaman güncel olarak override edilir (tedarikçi katalogda adı değiştirebilir).
- `p_unit_price IS NULL` ise: `products.current_unit_price` dokunulmaz, `last_seen_at` güncellenmez, snapshot yazılmaz (scraper parse edemezse bu fonksiyonu çağırmamalı; ama defansif olarak güvenli).
- `SECURITY INVOKER`; `service_role` çağrı yaparsa RLS bypass olur.

---

## RLS Politikaları

Tüm 5 tabloda RLS aktif. Her tablo için aynı pattern:

```text
CREATE POLICY "authenticated görür" ON <table> FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated yazar" ON <table> FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated günceller" ON <table> FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated siler" ON <table> FOR DELETE
  USING (auth.uid() IS NOT NULL);
```

`service_role` otomatik bypass (Supabase davranışı).

---

## State Transitions (informational)

- **supplier_orders.status**: scraper'ın okuduğu metin (`Onaylandı`, `Onay bekliyor`, `İptal`, `Teslim edildi` vb.). Enum DEĞİL; tedarikçi sitenin metni neyse o saklanır. Multi-supplier'da metin farklı olabilir.
- **products.current_unit_price**: NULL → değer → değer → ... (yalnızca artar değil; düşebilir de). Tarihçe `price_snapshots`'da.
- **price_snapshots**: immutable; append-only.

---

## Volume tahmini (1 yıl, tek kullanıcı)

| Tablo | Tahmini satır | Disk |
|-------|---------------|------|
| `suppliers` | 1–5 | <1 KB |
| `supplier_orders` | 200–1.000 | ~200 KB |
| `order_items` | 1.000–5.000 | ~1 MB |
| `products` | 500–2.000 | ~300 KB |
| `price_snapshots` | 10.000–50.000 (fiyat değiştikçe) | ~5 MB |

Toplam ~10 MB; Supabase free 500 MB sınırının %2'si. Sonraki 4 yıl bile güvenli.
