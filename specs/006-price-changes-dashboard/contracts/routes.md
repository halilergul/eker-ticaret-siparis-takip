# Contract — Route Map

**Feature**: 006-price-changes-dashboard | **Tarih**: 2026-05-17

## Yeni / değişen route'lar

| Path | File | Type | Auth | Description |
|------|------|------|------|-------------|
| `/dashboard/price-changes` | `app/(app)/dashboard/price-changes/page.tsx` | Server Component (yeni) | Required | Zamlanan ürünler listesi |
| `/dashboard/products/[id]` | `app/(app)/dashboard/products/[id]/page.tsx` | Server Component (yeni) | Required | Ürün fiyat tarihçesi + sipariş geçmişi |

005'in route'ları (`/dashboard`, `/dashboard/orders/[id]`) değişmiyor — sadece `OrderDetailCard` (005 component) ürün satırlarına `/dashboard/products/<id>` link'i ekleyecek.

## URL search params

### `/dashboard/price-changes`

| Param | Tip | Validation | Default | Açıklama |
|-------|-----|------------|---------|----------|
| `days` | int | 1 ≤ N ≤ 365 (zod) | 7 | Karşılaştırma penceresi |
| `showDrops` | `"0"` \| `"1"` | enum | "0" | Fiyat düşüşlerini de göster |

Geçersiz değer → sessiz default fallback. URL temizlenmez (5. desenin koru).

Örnekler:
- `/dashboard/price-changes` → son 7 gün, sadece zamlar
- `/dashboard/price-changes?days=30` → son 30 gün, sadece zamlar
- `/dashboard/price-changes?days=14&showDrops=1` → son 14 gün, zam + indirim

### `/dashboard/products/[id]`

URL param: `id` = `products.id` (UUID).

Search params: yok (V1; V2'de tarih aralığı filter eklenebilir).

## Page metadata

```ts
// /dashboard/price-changes
export const metadata: Metadata = {
  title: "Zamlanan Ürünler — Eker Ticaret",
};

// /dashboard/products/[id]
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const product = await getProductById(id);
  return {
    title: product
      ? `${product.name} — Eker Ticaret`
      : "Ürün — Eker Ticaret",
  };
}
```

## Auth davranışı

- Middleware (`lib/supabase/middleware.ts` from 001): `/dashboard/*` cookie session yoksa `/login`'e yönlendirir; bu rotalar zaten kapsamda.
- Layout (`app/(app)/layout.tsx` from 001): defense-in-depth aynı.
- Bu feature mevcut auth'a dokunmaz.

## Route navigation patterns

| From | To | Method | Notlar |
|------|-----|--------|--------|
| `/dashboard` (top bar veya nav) | `/dashboard/price-changes` | `<Link>` | Top bar'a "Zamlananlar" link'i eklenir |
| `/dashboard/price-changes` (satır) | `/dashboard/products/<id>` | `<Link>` (RSC `<a>`) | Ürün satırı tıklanabilir |
| `/dashboard/price-changes` (satır içi "Siparişe git") | `/dashboard/orders/<id>` | `<Link>` | last_order_id varsa |
| `/dashboard/orders/<id>` (item satırı, 005 reviz) | `/dashboard/products/<id>` | `<Link>` | order_items.product_id resolve edilirse |
| `/dashboard/products/<id>` (sipariş listesi) | `/dashboard/orders/<id>` | `<Link>` | Her satır clickable |
| `/dashboard/products/<id>` (geri) | `/dashboard/price-changes` veya `/dashboard` | `<Link>` veya browser back | İki link sun: "← Zamlananlara dön" + "← Dashboard'a dön" |

## ROUTES sabit güncelleme

`lib/routes.ts` (005'te güncellendi):

```ts
export const ROUTES = {
  HOME: "/",
  LOGIN: "/login",
  DASHBOARD: "/dashboard",
  ORDER_DETAIL: (id: string) => `/dashboard/orders/${id}`,
  // YENİ:
  PRICE_CHANGES: "/dashboard/price-changes",
  PRODUCT_DETAIL: (id: string) => `/dashboard/products/${id}`,
} as const;
```

## Top bar güncellemesi

`components/ui/top-bar.tsx` (001'den) içine `<Link href={ROUTES.PRICE_CHANGES}>Zamlananlar</Link>` eklenir. Aktif sayfada `aria-current="page"` + visual indicator.

Top bar componenti minimum genişletme (1-2 satır); navigation'ın eksiksiz olması için zorunlu.

## 404 davranışı

- `/dashboard/products/<geçersiz-uuid>`: Postgres `invalid input syntax` → error.tsx boundary yakalar (V1'de error.tsx yoksa default Next.js error sayfası).
- `/dashboard/products/<valid-uuid-ama-yok>`: `getProductById` `null` döner → `notFound()` → Next.js 404 sayfası.

005'teki davranışın aynısı; ek özel error.tsx gerekmiyor.
