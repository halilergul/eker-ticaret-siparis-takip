# Contract — URL Search Params Filter

**Feature**: 005-orders-dashboard | **Tarih**: 2026-05-16

## URL şeması

```text
/dashboard?supplier=<slug>&status=<text>
```

Tüm param'lar opsiyoneldir. Yoksa filtre uygulanmaz (tüm siparişler görünür).

## Örnek URL'ler

| URL | Anlam |
|-----|-------|
| `/dashboard` | Tüm sipariş, tüm tedarikçi, tüm durum |
| `/dashboard?supplier=enderyapi` | Sadece Enderyapi siparişleri |
| `/dashboard?status=Onaylandı` | Sadece onaylanmış (her supplier) |
| `/dashboard?supplier=enderyapi&status=Onaylandı` | Enderyapi'nin onaylanmış siparişleri |
| `/dashboard?supplier=hatalı_slug` | Validation fail → filter uygulanmaz, tüm sipariş |
| `/dashboard?status=` | Boş string → filter uygulanmaz |

## URL encoding

- `status` TR karakter içerebilir (`Onaylandı`, `Onay bekliyor`): `encodeURIComponent` kullanılır.
  - `Onaylandı` → `Onayland%C4%B1`
  - `Onay bekliyor` → `Onay%20bekliyor`
- Next.js `router.push` ve `<Link>` bu encoding'i otomatik yapar.

## Server Component'ta consumption

```ts
// app/(app)/dashboard/page.tsx
type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({ searchParams }: Props) {
  const params = await searchParams;
  const filter = parseFilter(params);  // FilterState
  const orders = await listOrders(filter);
  // ...
}
```

Next.js 15: `searchParams` artık `Promise` — `await` zorunlu.

## Client Component'ta yazma

```tsx
// components/features/orders/filter-bar.tsx
"use client";
import { useRouter, useSearchParams } from "next/navigation";

export function FilterBar({ suppliers, statuses }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const sp = new URLSearchParams(searchParams);
    if (value) sp.set(key, value);
    else sp.delete(key);
    router.push(`/dashboard?${sp.toString()}`);
  }

  // <select onChange={(e) => setParam('supplier', e.target.value)}> ...
}
```

## Validation (zod)

`lib/validations/order-filter.ts`:

```ts
export const orderFilterSchema = z.object({
  supplier: z.string().regex(/^[a-z0-9-]+$/).optional(),
  status: z.string().min(1).max(50).optional(),
});
```

Invalid değer → `parseFilter()` boş `{}` döner; SQL WHERE clause atlanır.

## "Filtreleri Temizle" button

```tsx
<Link href="/dashboard" className="text-sm text-slate-500 hover:underline">
  Filtreleri temizle
</Link>
```

URL'i sıfırlar (no search params); Server Component re-render tüm satırları getirir.

## URL state korunması — geri butonu

1. Kullanıcı `/dashboard?supplier=enderyapi` açar.
2. Bir sipariş satırına tıklar → `/dashboard/orders/<uuid>`.
3. Browser back butonu → `/dashboard?supplier=enderyapi`.
4. Filter dropdown'lar otomatik "Enderyapi" seçili gösterir (Server Component `searchParams`'tan alır).

Bu davranış URL search params kullandığımız için bedava gelir; ek state yönetimi YOK.
