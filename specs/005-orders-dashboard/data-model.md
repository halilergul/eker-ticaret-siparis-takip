# Data Model — Dashboard UI Projections

**Feature**: 005-orders-dashboard | **Tarih**: 2026-05-16

Bu feature **DB schema'ya dokunmaz**. Sadece UI projection tipleri + sorgu pattern'ları tanımlar.

---

## 1. OrderTableRow

Tablo satırının UI'da ihtiyaç duyduğu minimal şekil. `supplier_orders` + `suppliers.name` join.

```ts
export type OrderTableRow = {
  id: string;                // supplier_orders.id (UUID)
  orderNo: string;           // supplier_orders.order_no
  supplierSlug: string;      // suppliers.slug (filter için)
  supplierName: string;      // suppliers.name
  status: string;            // supplier_orders.status (TR text)
  orderedAt: string;         // supplier_orders.ordered_at (ISO timestamptz)
  totalAmount: number;       // supplier_orders.total_amount (numeric → JS number)
  currency: string;          // 'TRY' (sabit V1)
};
```

**SQL pattern** (lib/queries/orders.ts içinde Supabase JS):

```ts
const query = supabase
  .from('supplier_orders')
  .select(`
    id, order_no, status, ordered_at, total_amount, currency,
    supplier:suppliers!inner ( slug, name )
  `)
  .order('ordered_at', { ascending: false });

if (filter.supplierSlug) {
  query.eq('supplier.slug', filter.supplierSlug);
}
if (filter.status) {
  query.eq('status', filter.status);
}
```

Sonra Supabase response shape → `OrderTableRow[]` transformer:

```ts
function toRow(r: SupplierOrderWithSupplier): OrderTableRow {
  return {
    id: r.id,
    orderNo: r.order_no,
    supplierSlug: r.supplier.slug,
    supplierName: r.supplier.name,
    status: r.status,
    orderedAt: r.ordered_at,
    totalAmount: Number(r.total_amount),  // numeric → number
    currency: r.currency,
  };
}
```

---

## 2. OrderDetail

Detay sayfasının ihtiyaç duyduğu zenginleştirilmiş şekil. `supplier_orders` + `suppliers` + `order_items`.

```ts
export type OrderDetail = {
  id: string;
  orderNo: string;
  supplierName: string;
  supplierSlug: string;
  status: string;
  orderedAt: string;
  totalAmount: number;
  currency: string;
  notes: string | null;
  items: OrderDetailItem[];
  computedTotal: number;     // Σ items.lineTotal — UI tarafında hesaplanır
};

export type OrderDetailItem = {
  id: string;
  productCode: string;
  productName: string;
  quantity: number;
  unitPriceAtOrder: number;
  lineTotal: number;         // quantity * unitPriceAtOrder, sayı yuvarlama dikkat
};
```

**SQL pattern** (tek sorgu):

```ts
const { data, error } = await supabase
  .from('supplier_orders')
  .select(`
    *,
    supplier:suppliers!inner ( slug, name ),
    items:order_items ( id, product_code, product_name, quantity, unit_price_at_order )
  `)
  .eq('id', orderId)
  .maybeSingle();
```

`maybeSingle()`: 0 satır → `data=null` (Next.js `notFound()` çağır). 1+ satır impossible (PK).

**computedTotal hesabı**: `items.reduce((sum, it) => sum + it.quantity * it.unitPriceAtOrder, 0)`. Yuvarlama: `Number((sum).toFixed(2))` ile 2 ondalık.

**Data quality flag**: `Math.abs(computedTotal - totalAmount) > 0.01` → UI'da ⚠ badge (SC-007).

---

## 3. FilterState

URL search params'tan parse edilmiş filter durumu.

```ts
export type FilterState = {
  supplierSlug?: string;
  status?: string;
};
```

**zod schema** (`lib/validations/order-filter.ts`):

```ts
import { z } from "zod";

export const orderFilterSchema = z.object({
  supplier: z.string().regex(/^[a-z0-9-]+$/).optional(),
  status: z.string().min(1).max(50).optional(),
});

export type OrderFilterInput = z.infer<typeof orderFilterSchema>;

export function parseFilter(searchParams: URLSearchParams | Record<string, string | string[] | undefined>): FilterState {
  const obj = searchParams instanceof URLSearchParams
    ? Object.fromEntries(searchParams)
    : searchParams;
  const result = orderFilterSchema.safeParse({
    supplier: typeof obj.supplier === "string" ? obj.supplier : undefined,
    status: typeof obj.status === "string" ? obj.status : undefined,
  });
  if (!result.success) return {};
  return {
    supplierSlug: result.data.supplier,
    status: result.data.status,
  };
}
```

---

## 4. SupplierOption + StatusOption (filter dropdown)

```ts
export type SupplierOption = {
  slug: string;       // value
  name: string;       // label
};

export type StatusOption = {
  value: string;
  label: string;      // V1'de value === label (TR text)
};
```

**Pattern**:
- `listSuppliers()` → `SELECT slug, name FROM suppliers ORDER BY name`.
- `listDistinctStatuses()` → `SELECT DISTINCT status FROM supplier_orders ORDER BY status`. (V1'de küçük tablo; index gerek yok.)

Dropdown ilk option: "Tüm tedarikçiler" / "Tüm durumlar" (value `""`).

---

## 5. Format helper sözleşmeleri

### `lib/format/date.ts`

```ts
const dateFormatter = new Intl.DateTimeFormat('tr-TR', {
  day: '2-digit', month: '2-digit', year: 'numeric',
});

const relativeFormatter = new Intl.RelativeTimeFormat('tr-TR', { numeric: 'auto' });

/**
 * Tek-yönlü format. < 7 gün → "X gün önce" / "bugün" / "dün"; sonrası tam tarih.
 */
export function formatTrDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0 || diffDays > 6) return dateFormatter.format(date);
  if (diffDays === 0) return relativeFormatter.format(0, 'day');  // "bugün"
  return relativeFormatter.format(-diffDays, 'day');  // "X gün önce"
}
```

### `lib/format/currency.ts`

```ts
const formatter = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  minimumFractionDigits: 2,
});

export function formatTry(amount: number): string {
  return formatter.format(amount);
}
```

Çıktı örnekleri:
- `formatTry(1234.56)` → `"1.234,56 ₺"`
- `formatTry(0)` → `"0,00 ₺"`

---

## 6. Mevcut DB tabloları (referans, değiştirilmez)

| Tablo | Kullanım |
|-------|----------|
| `suppliers` | `listSuppliers()`, join `supplier_orders` |
| `supplier_orders` | Ana sorgu (filter + sort) |
| `order_items` | `getOrderDetail()` join |
| `products` | (Bu feature kullanmıyor; 007+'ta fiyat fark için lazım) |
| `price_snapshots` | (Bu feature kullanmıyor) |
| `scrape_runs` | (Bu feature kullanmıyor; 008+ "son güncelleme" badge için kullanılabilir) |

---

## 7. RLS doğrulama matrix (manuel test)

| Senaryo | Beklenen |
|---------|----------|
| Authenticated user, session var | Tüm `supplier_orders` rows |
| Anonim (login yok) → `/dashboard` | Redirect to `/login` (middleware) |
| Authenticated user manuel SQL ile başka user'ın verisini sorgular | (N/A — single user) |
| `getOrderDetail("nonexistent-uuid")` | `null` döner; UI `notFound()` |

RLS politikaları 003'te kuruldu (`(select auth.uid()) IS NOT NULL`); bu feature ekstra policy eklemez.
