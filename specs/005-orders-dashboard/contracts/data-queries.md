# Contract — Data Query API

**Feature**: 005-orders-dashboard | **Tarih**: 2026-05-16

`lib/queries/orders.ts` — Server Component'ların tükettiği data layer modülü.

## Public API

```ts
import { createClient } from "@/lib/supabase/server";
import type { FilterState, OrderDetail, OrderTableRow, SupplierOption } from "./types";

export async function listOrders(filter?: FilterState): Promise<OrderTableRow[]>;
export async function getOrderDetail(id: string): Promise<OrderDetail | null>;
export async function listSuppliers(): Promise<SupplierOption[]>;
export async function listDistinctStatuses(): Promise<string[]>;
```

## 1. `listOrders(filter?)`

**Behavior**:
- `supplier_orders` join `suppliers!inner` → `ordered_at DESC`.
- `filter.supplierSlug` set ise WHERE `supplier.slug = ?`.
- `filter.status` set ise WHERE `status = ?`.
- Return `OrderTableRow[]`; hata olursa throw.

**Implementation sketch**:

```ts
export async function listOrders(filter: FilterState = {}): Promise<OrderTableRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("supplier_orders")
    .select(`id, order_no, status, ordered_at, total_amount, currency,
             supplier:suppliers!inner ( slug, name )`)
    .order("ordered_at", { ascending: false });

  if (filter.supplierSlug) {
    query = query.eq("supplier.slug", filter.supplierSlug);
  }
  if (filter.status) {
    query = query.eq("status", filter.status);
  }

  const { data, error } = await query;
  if (error) throw new Error(`listOrders failed: ${error.message}`);
  return (data ?? []).map(toOrderTableRow);
}
```

**Error handling**: throw; caller (page.tsx) try/catch yapmaz — Next.js `error.tsx` boundary'sine bırakır (V1'de henüz yok ama gerekirse eklenir).

**Empty result**: boş array; caller `<EmptyState>` render eder.

## 2. `getOrderDetail(id)`

**Behavior**:
- `supplier_orders` + `suppliers!inner` + `order_items` join (tek query).
- `maybeSingle()` → 0 row → `null`.
- `items` array, sıralama: `created_at ASC` (insertion order; sipariş anındaki sıra).

**Implementation sketch**:

```ts
export async function getOrderDetail(id: string): Promise<OrderDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("supplier_orders")
    .select(`
      id, order_no, status, ordered_at, total_amount, currency, notes,
      supplier:suppliers!inner ( slug, name ),
      items:order_items ( id, product_code, product_name, quantity, unit_price_at_order )
    `)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`getOrderDetail failed: ${error.message}`);
  if (!data) return null;
  return toOrderDetail(data);
}
```

**Caller pattern** (`app/(app)/dashboard/orders/[id]/page.tsx`):

```tsx
import { notFound } from "next/navigation";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getOrderDetail(id);
  if (!detail) notFound();
  return <OrderDetailCard detail={detail} />;
}
```

## 3. `listSuppliers()`

**Behavior**: `SELECT slug, name FROM suppliers ORDER BY name`.

**Implementation**:

```ts
export async function listSuppliers(): Promise<SupplierOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("slug, name")
    .order("name", { ascending: true });
  if (error) throw new Error(`listSuppliers failed: ${error.message}`);
  return data ?? [];
}
```

## 4. `listDistinctStatuses()`

**Behavior**: DB'de var olan distinct status değerleri. Postgres'te `SELECT DISTINCT status FROM supplier_orders ORDER BY status`.

**Implementation**:

```ts
export async function listDistinctStatuses(): Promise<string[]> {
  const supabase = await createClient();
  // Supabase JS distinct hint: '*' replaced with column; in lieu of native distinct,
  // group by trick yok. En basit yol: tüm status'ları çek, Set'le tekleştir.
  const { data, error } = await supabase
    .from("supplier_orders")
    .select("status");
  if (error) throw new Error(`listDistinctStatuses failed: ${error.message}`);
  const set = new Set((data ?? []).map((r) => r.status));
  return Array.from(set).sort();
}
```

**Not**: Supabase REST API native `DISTINCT` desteklemiyor. Alternatif: `pg_rest` view veya RPC fonksiyonu yazmak. V1'de tüm status'ları çekmek küçük tablo için kabul edilebilir (<1000 satır × 1 kolon).

**V2 optimizasyon**: View `vw_distinct_statuses` veya RPC `get_distinct_statuses()`; veri hacmi 10k+'a ulaşırsa.

## Tip dönüşüm fonksiyonları (private helpers)

```ts
// numeric → number (Supabase JS returns string for numeric)
function toOrderTableRow(r: SupplierOrderRow): OrderTableRow {
  return {
    id: r.id,
    orderNo: r.order_no,
    supplierSlug: r.supplier.slug,
    supplierName: r.supplier.name,
    status: r.status,
    orderedAt: r.ordered_at,
    totalAmount: Number(r.total_amount),
    currency: r.currency,
  };
}

function toOrderDetail(r: SupplierOrderWithItems): OrderDetail {
  const items: OrderDetailItem[] = (r.items ?? []).map((it) => {
    const qty = Number(it.quantity);
    const unit = Number(it.unit_price_at_order);
    return {
      id: it.id,
      productCode: it.product_code,
      productName: it.product_name,
      quantity: qty,
      unitPriceAtOrder: unit,
      lineTotal: Number((qty * unit).toFixed(2)),
    };
  });
  const computedTotal = Number(
    items.reduce((sum, it) => sum + it.lineTotal, 0).toFixed(2)
  );
  return {
    id: r.id,
    orderNo: r.order_no,
    supplierName: r.supplier.name,
    supplierSlug: r.supplier.slug,
    status: r.status,
    orderedAt: r.ordered_at,
    totalAmount: Number(r.total_amount),
    currency: r.currency,
    notes: r.notes,
    items,
    computedTotal,
  };
}
```

## Auth context

Tüm fonksiyonlar `createClient()` (Server) ile çalışır → cookie session okunur → authenticated user gibi davranır. RLS satırları filtreler. service_role kullanılmaz.

**Sonuç**: anonymous user bu fonksiyonları çağırsa bile boş veri görür (RLS bloklar). Middleware zaten anonim user'ı `/login`'e yönlendirir; defense-in-depth için RLS yeterli.

## Edge cases

| Senaryo | Davranış |
|---------|----------|
| `id` geçersiz UUID format | Supabase error throw; caller `error.tsx` |
| `id` valid UUID ama row yok | `null` döner; `notFound()` |
| filter.supplierSlug geçersiz | Postgres exact eq → 0 row; empty state |
| filter.status TR karakter | UTF-8 + exact eq doğru çalışır |
| RLS auth fail (cookie expired) | Empty data (RLS blocks); middleware ayrıca yönlendirme yapar |
