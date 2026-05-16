# Data Model — Scrape Audit + Adapter Tipleri

**Feature**: 004-enderyapi-scraper-prod | **Tarih**: 2026-05-16

Bu feature **1 yeni tablo** (`scrape_runs`) + **runtime tipler** (Adapter, ScrapeContext, RawOrderSummary, RawOrderDetail, ScrapeSummary) sunar. Mevcut 003 tablolarına dokunulmaz; yalnızca yazma yapılır.

---

## 1. `scrape_runs` (yeni tablo)

Bir scrape koşumunun başlangıçtan bitişe denetim kaydı.

| Kolon | Tip | NULL | Default | Notes |
|-------|-----|------|---------|-------|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `supplier_id` | `uuid` | NO | — | FK → `suppliers(id)` ON DELETE RESTRICT |
| `started_at` | `timestamptz` | NO | `now()` | Koşum başlangıcı |
| `finished_at` | `timestamptz` | YES | NULL | NULL = running |
| `status` | `text` | NO | `'running'` | CHECK IN ('running','success','partial','failed','aborted') |
| `summary` | `jsonb` | NO | `'{}'::jsonb` | ScrapeSummary şeması (aşağıda) |
| `error_message` | `text` | YES | NULL | Top-level error (login fail vb.); NULL = no fatal error |
| `created_at` | `timestamptz` | NO | `now()` | |

**Constraints**:
- `PRIMARY KEY (id)`
- `FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT`
- `CHECK (status IN ('running','success','partial','failed','aborted'))`
- `CHECK (finished_at IS NULL OR finished_at >= started_at)`

**Indexes**:
- `(supplier_id, started_at DESC)` composite — "supplier'ın son N koşumu"
- `(started_at DESC)` — global son koşum sorgusu

**Append-only**: V1'de UPDATE sadece `finished_at`, `status`, `summary`, `error_message` için (running → terminal state'e geçiş).

### ScrapeSummary JSON şeması

```ts
{
  orders_total: number,       // sipariş listesinde görüldü
  orders_inserted: number,    // yeni
  orders_skipped: number,     // dup
  items_inserted: number,
  items_skipped: number,
  products_observed: number,  // record_price_observation çağrı sayısı
  snapshots_added: number,    // fiyat değiştiği için
  errors: Array<{
    step: string,             // "login" | "list-orders" | "order-detail" | "catalog-visit" | "db-write"
    mode: string,             // FailureMode değeri
    detail: string,           // kullanıcıya gösterilecek kısa metin (kimlik bilgisi içermez)
    timestamp: string         // ISO
  }>
}
```

Zod schema `lib/scraper/types.ts`'te. UI (006+) bu yapıyı tüketir.

---

## 2. Runtime tipleri (`lib/scraper/types.ts`)

Bu tipler DB'de saklanmaz; sadece Node.js process içinde.

### `Adapter` interface

```ts
export interface Adapter {
  readonly slug: string;          // Stable ID, suppliers.slug ile eşleşir
  readonly displayName: string;   // Kullanıcı-friendly
  login(ctx: ScrapeContext): Promise<void>;
  listOrders(ctx: ScrapeContext, limit?: number): Promise<RawOrderSummary[]>;
  getOrderDetail(ctx: ScrapeContext, order: RawOrderSummary): Promise<RawOrderDetail>;
  getProductPrice(ctx: ScrapeContext, productCode: string): Promise<number | null>;
}
```

### `ScrapeContext`

Playwright sayfası + akış bağlamı; her adapter metoduna pas geçilir.

```ts
export type ScrapeContext = {
  page: Page;                    // Playwright
  supplierId: string;            // suppliers.id (UUID)
  runId: string;                 // scrape_runs.id
  verbose: boolean;
  debugDir: string;              // scrape-debug/<runId>/
  pushError(step: string, mode: FailureMode, detail: string): void;
};
```

### `RawOrderSummary`

Sipariş listesinden okunan satır; detay/items henüz YOK.

```ts
export type RawOrderSummary = {
  orderNo: string;       // "ESP018-12345"
  status: string;        // Türkçe (tedarikçinin verdiği)
  orderedAt: string;     // ISO
  totalAmount: number;
  detailUrl?: string;    // adapter detay sayfasını URL'den buluyorsa
};
```

### `RawOrderDetail`

Sipariş detay sayfasından okunan tam veri.

```ts
export type RawOrderDetail = {
  summary: RawOrderSummary;
  items: RawOrderItem[];
};

export type RawOrderItem = {
  productCode: string;
  productName: string;
  quantity: number;
  unitPriceAtOrder: number;
};
```

### `ScrapeSummary`

JSON şeması yukarıda; type alias:

```ts
export type ScrapeSummary = z.infer<typeof scrapeSummarySchema>;
```

---

## 3. RLS politikaları (`scrape_runs`)

003'teki pattern, 4 policy + GRANT. `auth.uid()` `(select auth.uid())` ile sarılı (003 lessons learned).

```sql
ALTER TABLE public.scrape_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY scrape_runs_authenticated_read   ON public.scrape_runs FOR SELECT USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY scrape_runs_authenticated_insert ON public.scrape_runs FOR INSERT WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY scrape_runs_authenticated_update ON public.scrape_runs FOR UPDATE USING ((select auth.uid()) IS NOT NULL) WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY scrape_runs_authenticated_delete ON public.scrape_runs FOR DELETE USING ((select auth.uid()) IS NOT NULL);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scrape_runs TO authenticated;
```

`service_role` (scraper) RLS bypass.

---

## 4. State transitions

`scrape_runs.status` lifecycle:

```text
running  ──→  success    (errors=[])
   │
   ├─────→  partial    (errors[] dolu ama orders_inserted > 0 veya items_inserted > 0)
   │
   ├─────→  failed     (login fail veya init fail; orders_inserted = 0)
   │
   └─────→  aborted    (global 5dk timeout veya SIGINT)
```

`status='running'` finished_at NULL. Bütün diğer durumlar finished_at set.

---

## 5. Volume tahmini (1 yıl)

| Senaryo | Satır | Disk |
|---------|-------|------|
| Manuel V1 (haftada 1-2 koşum) | ~100 satır | <1 MB |
| Otomatik 005 (saatlik) | ~9000 satır | ~30 MB |

Free tier sınırının %6'sı (en kötü senaryoda).

---

## 6. Mevcut 003 tablolarıyla etkileşim

Bu feature 003 tablolarına **yalnızca yazar**:

| Tablo | Operasyon | Sıklık |
|-------|-----------|--------|
| `suppliers` | SELECT (slug → id lookup) | Run başına 1 |
| `supplier_orders` | INSERT ON CONFLICT DO NOTHING | Sipariş başına 1 |
| `order_items` | INSERT ON CONFLICT DO NOTHING | Satır başına 1 |
| `products` | (RPC içinden INSERT/UPDATE) | Ürün başına 1 |
| `price_snapshots` | (RPC içinden INSERT) | Fiyat değişimi başına 1 |
| `scrape_runs` | INSERT (start), UPDATE (finish) | Run başına 2 |
