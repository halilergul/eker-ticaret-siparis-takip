# Contract — Route Map

**Feature**: 005-orders-dashboard | **Tarih**: 2026-05-16

## Yeni / değişen route'lar

| Path | File | Type | Auth | Description |
|------|------|------|------|-------------|
| `/dashboard` | `app/(app)/dashboard/page.tsx` | Server Component (rewrite) | Required | Sipariş tablosu + filter bar + empty state |
| `/dashboard/orders/[id]` | `app/(app)/dashboard/orders/[id]/page.tsx` | Server Component (yeni) | Required | Sipariş detayı (header + item satırları) |

`/dashboard/orders/[id]` `notFound()` → Next.js default 404 sayfası gösterir (`app/not-found.tsx` yoksa otomatik fallback).

## URL search params (yalnızca `/dashboard` için)

| Param | Tip | Validation | Default | Açıklama |
|-------|-----|------------|---------|----------|
| `supplier` | `string` (slug) | `^[a-z0-9-]+$`, opsiyonel | undefined | Aktif tedarikçi filtresi |
| `status` | `string` | `min 1, max 50`, opsiyonel | undefined | Aktif durum filtresi |

Geçersiz değer → filtre uygulanmaz (sessiz fallback).

## Page metadata

```ts
// /dashboard
export const metadata: Metadata = {
  title: "Dashboard — Eker Ticaret",
};

// /dashboard/orders/[id]
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  return {
    title: `Sipariş Detayı — Eker Ticaret`,
  };
}
```

`generateMetadata` async olarak siparişin `order_no`'sunu lookup edebilir (V2 nice-to-have); V1'de statik OK.

## Auth davranışı

- Middleware (`lib/supabase/middleware.ts` from 001): `/dashboard/*` cookie session yoksa `/login`'e yönlendirir.
- Layout (`app/(app)/layout.tsx` from 001): defense-in-depth; user lookup başarısızsa `redirect(ROUTES.LOGIN)`.
- Bu feature mevcut auth'a dokunmaz.

## Route navigation patterns

| From | To | Method | Notlar |
|------|-----|--------|--------|
| `/dashboard` (tablo satırı) | `/dashboard/orders/<id>` | `<Link>` (Client island içinden `useRouter.push()` veya `<Link>`) | Server Component `<a>` da olur |
| `/dashboard/orders/<id>` → geri | `/dashboard` (filter URL korunur) | Browser back butonu | Otomatik (URL state korunduğu için) |
| Empty state CTA | (komut kopyala) | Clipboard API | Sayfa nav YOK |
| Top bar logo (mevcut) | `/dashboard` | `<Link>` (001'den) | Mevcut |

## ROUTES sabiti güncelleme

`lib/routes.ts` (001'de var):

```ts
export const ROUTES = {
  LOGIN: "/login",
  DASHBOARD: "/dashboard",
  ORDER_DETAIL: (id: string) => `/dashboard/orders/${id}`,  // YENİ
} as const;
```
