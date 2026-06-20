# Data Model — Phase 1

**Feature**: Bayi Panel Sipariş Pagination
**Date**: 2026-06-20

---

## Genel

Bu feature **DB şeması değiştirmez**. Yeni tablo, yeni kolon, yeni constraint yok. Mevcut entity'lerin idempotency garantileri pagination eklemesini doğal olarak destekler.

Tek değişiklik: `scrape_runs.summary` (JSONB) içine **yeni bir opsiyonel alan** ekleniyor. JSONB olduğu için migration gerekmiyor.

---

## Etkilenen Entity'ler (mevcut, değişmez)

### `supplier_orders`

| Sütun | Tip | Pagination ile İlişki |
|-------|-----|----------------------|
| `id` | uuid PK | — |
| `supplier_id` | uuid FK | — |
| `order_no` | text NOT NULL | **idempotency anahtarı** — `UNIQUE (supplier_id, order_no)` constraint duplicate'leri engelliyor. Pagination 100 sayfa bile gezse aynı orderNo iki kez eklenemez. |
| `status` | text | — |
| `ordered_at` | timestamptz | — |
| `total_amount` | numeric | — |
| `currency` | text | — |
| `notes` | text NULL | — |
| `created_at` | timestamptz | — |

**Pagination invariant**: Bir adapter sayfa N ve sayfa N+1'de aynı `order_no`'yu döndürürse, ikincisi DB INSERT'te ON CONFLICT DO NOTHING ile reddedilir. `seenOrderNos` Set (R-006) zaten bu durumu adapter tarafında yakalar — ek koruma.

---

### `order_items`

| Sütun | Tip | Pagination ile İlişki |
|-------|-----|----------------------|
| `id` | uuid PK | — |
| `order_id` | uuid FK → supplier_orders | — |
| `product_id` | uuid FK NULL | — |
| `product_code` | text | — |
| `product_name` | text | — |
| `quantity` | numeric | — |
| `unit_price_at_order` | numeric | — |
| `created_at` | timestamptz | — |

**Pagination invariant**: Order_items `UNIQUE (order_id, product_code)` constraint (008'de eklendi) duplicate'leri engelliyor. Bir order_items satırı yalnızca o `order_no` ilk defa eklendiğinde insert ediliyor (mevcut ensureOrder akışı).

---

### `scrape_runs`

| Sütun | Tip | Pagination ile İlişki |
|-------|-----|----------------------|
| `id` | uuid PK | — |
| `supplier_id` | uuid FK | — |
| `started_at` | timestamptz | — |
| `finished_at` | timestamptz NULL | — |
| `status` | text | success / partial / failed / running |
| `summary` | jsonb | **Yeni alan eklenir: `pages_visited`** |
| `error_message` | text NULL | — |
| `trigger_type` | text | manual / auto / unknown |
| `created_at` | timestamptz | — |

---

## Genişleyen Alan: `scrape_runs.summary`

### Mevcut JSONB şekli

```json
{
  "orders_total": 50,
  "orders_inserted": 0,
  "orders_skipped": 50,
  "items_inserted": 0,
  "items_skipped": 171,
  "snapshots_added": 0,
  "snapshots_skipped": 157,
  "products_observed": 157,
  "errors": []
}
```

### 011 sonrası şekli (yeni alan)

```json
{
  "orders_total": 87,
  "orders_inserted": 37,
  "orders_skipped": 50,
  "items_inserted": 124,
  "items_skipped": 171,
  "snapshots_added": 0,
  "snapshots_skipped": 157,
  "products_observed": 157,
  "errors": [],
  "pages_visited": 2
}
```

### Alan tanımı

| Alan | Tip | Anlamı |
|------|-----|--------|
| `pages_visited` | `number` (opsiyonel) | Adapter listOrders fonksiyonunun gezdiği toplam sayfa sayısı. Pagination'sız panel için `1`. Adapter set etmezse `undefined` (eski runs ile uyumlu). |

### Doğrulama kuralları

- `pages_visited >= 1` (1 dahil — pagination çalışsa bile en az 1 sayfa gezilir)
- `pages_visited <= 50` (MAX_PAGES safety upper bound)
- Eski scrape_runs satırları (011 öncesi) `pages_visited` alanı içermez — UI/query bunu undefined olarak kabul etmeli

---

## Idempotency Garantileri (özet)

| Tablo | Constraint | Pagination ile davranış |
|-------|-----------|-------------------------|
| `supplier_orders` | UNIQUE (supplier_id, order_no) | Aynı orderNo iki kez insert edilemez → ON CONFLICT skip |
| `order_items` | UNIQUE (order_id, product_code) | Aynı (orderId, productCode) iki kez insert edilemez → skip |
| `price_snapshots` | writer-side dedup (009) | Aynı fiyat → no-op insert |
| `products` | UPSERT by (supplier_id, code) | Aynı ürün yeni siparişten gelse de güncel kalır |

**Sonuç**: Pagination ile gezilen ek sayfalardan gelen siparişler için tüm constraint'ler korur. Yeni doğrulama veya migration gerekmez.

---

## Şema değişikliği gerektirebilecek durumlar (gelecek için not)

Eğer ileride şu ihtiyaçlar çıkarsa migration düşünülür (011 kapsamında YOK):

- **Tarih filtresi**: `last_paged_at` kolonu eklenip "son N gün scrape et" özelliği
- **Sayfa-bazlı state**: `last_successful_page` kolonu eklenip "kaldığı yerden devam"
- **Detaylı telemetry**: `scrape_runs.pages` (jsonb array) — her sayfanın süresi/satır sayısı

011 hepsini değil, sadece toplu `pages_visited` sayısını kaydeder (en az gerekli telemetry).
