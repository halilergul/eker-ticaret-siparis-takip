# Phase 0 — Dashboard UI Decisions

**Feature**: 005-orders-dashboard | **Tarih**: 2026-05-16

12 teknik karar `Decision / Rationale / Alternatives` formatında.

---

## R-001 — Server vs Client Component karışımı

**Decision**: Tüm sayfa + table + row + detail Server Component; sadece **FilterBar** Client Component (dropdown change → URL push).

**Rationale**:
- Constitution G3: "Server Component default; client component sadece interaktivite için".
- Veri DB'den gelir; static render her zaman daha hızlı.
- Filter dropdown'un değişimi → `router.push()` → URL search param güncelleme → Server Component re-render. Bu, Next.js App Router'da standart pattern.
- Client bundle minimum: sadece FilterBar JS'i (~5kb).

**Alternatives considered**:
- **Tümü Client Component + useState**: Daha "modern React" hissi; ama anlamsız — veri her zaman server'dan; client state hiçbir şeyi optimize etmiyor; bundle büyür.
- **React Query / SWR + Client**: Aşırı; statik render aynı performans.

---

## R-002 — Filter UI pattern: URL search params

**Decision**: `?supplier=enderyapi&status=Onaylandı` URL search params. Server Component `searchParams` prop'undan alır, zod ile parse eder, query'ye geçirir.

**Rationale**:
- URL bookmark'lanabilir (FR-009 + spec edge case).
- Geri butonu doğal çalışır.
- Server Component'la 1-1 eşleşir (state yönetimi YOK).
- Empty / invalid değer → zod fallback (undefined → "tüm").

**Alternatives considered**:
- **Cookie tabanlı**: kalıcılık vermez (her tab farklı görür), URL paylaşılabilir değil.
- **localStorage + Client**: SSR ile çelişkili; ilk render boş, sonra dolar (FOUC).

---

## R-003 — Filter Bar: nasıl URL'i güncelliyor?

**Decision**: Client Component `<FilterBar>`; `useRouter()` + `useSearchParams()` (`next/navigation`) ile change handler URL'i günceller. `router.push("/dashboard?...")` Server Component re-render tetikler.

**Rationale**:
- Next.js App Router'ın native pattern'ı.
- "Apply" butonu YOK; dropdown change anında apply (UX gereksiz adım çıkarır).
- "Filtreleri Temizle" butonu `router.push("/dashboard")`.

**Alternatives considered**:
- **`<form action>` server action**: çalışır ama dropdown için fazla heavy; her seçimde sayfa reload hissi.

---

## R-004 — Sipariş detayı: modal vs ayrı sayfa

**Decision**: **Ayrı sayfa** — `app/(app)/dashboard/orders/[id]/page.tsx`.

**Rationale**:
- Server Component'la natural fit (modal şart koşar Client Component + portal + state).
- URL paylaşılabilir (`/dashboard/orders/<uuid>` bookmark).
- Geri butonu = liste sayfasına dönüş, filter URL korunur.
- Mobil-first değil; geniş ekranda "tam sayfa detay" sorun değil.

**Alternatives considered**:
- **Modal (shadcn `<Dialog>`)**: Daha "app-like"; ama shadcn ekleme + Client Component zinciri + URL state sorunu çıkartır.
- **Inline expander**: Tabloda satırın altında açılma; karmaşıklığı artırır (state yönetimi), V2'de düşünülebilir.

---

## R-005 — TR locale formatting: library vs Intl

**Decision**: Native `Intl.DateTimeFormat('tr-TR')` + `Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' })`. Helper'lar `lib/format/`.

**Rationale**:
- Library YOK (date-fns + locale paketi ~20kb).
- Intl modern browser'larda + Node 20'de tam destek.
- "X gün önce" relative format için `Intl.RelativeTimeFormat('tr-TR')` mevcut.

**Alternatives considered**:
- **date-fns**: tam yetenekli ama bundle bloat (TR locale ayrı paket).
- **dayjs**: daha küçük ama hala dep.

**Pattern**:
```ts
// lib/format/date.ts
const formatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
export const formatTrDate = (iso: string) => formatter.format(new Date(iso));
```

---

## R-006 — RLS / authenticated client kullanımı

**Decision**: `lib/supabase/server.ts` (mevcut, 003'te typed) ile authenticated user session üzerinden sorgu. Service_role asla kullanılmaz.

**Rationale**:
- 003'te `authenticated` role'a CRUD GRANT verildi + RLS `(select auth.uid()) IS NOT NULL` izin verir.
- Constitution G12: service_role asla client-side'a sızmaz; Server Component teknik olarak server'da çalışıyor olsa da, defense-in-depth + future-proof (006'da client component'lar gelirse aynı pattern).

**Alternatives considered**:
- **service_role**: gereksiz risk; RLS zaten doğru kurulu.

---

## R-007 — Query API şekli (lib/queries/orders.ts)

**Decision**: Async fonksiyonlar, her biri tek sorumluluğa odaklı:

```ts
listOrders(filter: { supplierSlug?: string; status?: string }): Promise<OrderTableRow[]>
getOrderDetail(id: string): Promise<OrderDetail | null>   // null = not found
listSuppliers(): Promise<{ slug: string; name: string }[]>
listDistinctStatuses(): Promise<string[]>
```

**Rationale**:
- Component'lar yalnızca bu API'yi tüketir; SQL detay bilmez.
- `getOrderDetail` null-on-missing pattern → caller `notFound()` çağırır (Next.js helper).
- `listDistinctStatuses` filter dropdown'unu hardcode'lamadan doldurur.

**Alternatives considered**:
- **Tek `getDashboardData()`**: monolitik; filter + table + filter options birarada. Reddedildi — caching/granular reuse engelenir.

---

## R-008 — Boş tablo (empty state) içeriği

**Decision**: 2 satırlı UX mesaj:

> Henüz sipariş yok.
> Scraper'ı çalıştırarak ilk verileri alabilirsin:
> `npm run scrape -- --supplier enderyapi`

Komut metni `<code>` ile monospace + copy-to-clipboard (basit `navigator.clipboard.writeText` — Client Component).

**Rationale**:
- "Ne yapayım?" sorusunu kullanıcı asla sormamalı (SC-005).
- Komut göstermek = doğrudan eylem.

**Alternatives considered**:
- **Sadece "veri yok" mesajı**: kullanıcı yalnız bırakılır.

---

## R-009 — Tablo render: native HTML vs library

**Decision**: Native `<table>` + Tailwind class'lar. TanStack Table veya benzeri YOK.

**Rationale**:
- 50 satır için sorting / pagination / virtualization gerekmez.
- HTML table semantik (accessibility için iyi).
- Library bundle bloat'ı (TanStack ~30kb).

**Alternatives considered**:
- **TanStack Table**: V2'de filter / sort / pagination gerekirse eklenir.
- **Card layout**: dashboard görünümünde tablo daha "data-dense" — tercih edildi.

---

## R-010 — URL search param validation

**Decision**: zod schema `orderFilterSchema`:

```ts
export const orderFilterSchema = z.object({
  supplier: z.string().regex(/^[a-z0-9-]+$/).optional(),
  status: z.string().min(1).optional(),
});
```

`searchParams` Server Component prop'undan gelir, `safeParse` ile sınır kontrol. Invalid → undefined fallback (filter uygulanmaz).

**Rationale**:
- Constitution G4: form/external boundary validation.
- Postgres LIKE injection değil, equality sorgusu; ama URL manipülasyonu olsa bile sadece "0 satır" döner.

**Alternatives considered**:
- **Plain string check**: zaten zod var, kullan.

---

## R-011 — Sipariş satırı tıklama: `<Link>` vs `<button>` + router.push

**Decision**: `<Link href={`/dashboard/orders/${id}`}>` Next.js Link component. Tablo satırının tamamı clickable; içindeki text'ler ayrı Link değil.

**Rationale**:
- Native browser navigation (middle-click yeni tab açar; sağ tık copy URL).
- Server Component'la doğal uyumlu.
- Tablo satırı `<tr>` direkt Link yapamaz (HTML invalid); `<tr>` içeriğini `<td>`'lere böl + her hücreye `<Link>` veya satır seviyesinde `onClick` ile router.push.

**Implementation detay**: `<tr>` üstüne `onClick` Client Component zorunlu. Alternatif: tüm cell'lerdeki ilk text'i `<Link>` yapma; pratik değil.

**Pragmatik karar**: Tablo satırı **Client Component island** (`<OrderRow>`), `useRouter` ile satır click → `/dashboard/orders/<id>`. Cursor pointer + hover style.

**Alternatives considered**:
- **`<td>` her birine `<Link>`**: 5x Link aynı URL; tıklanabilir alan satır boyutunda olmaz (text-only).

---

## R-012 — Performance: server-side filter mi client-side filter mi?

**Decision**: **Server-side** — `listOrders(filter)` SQL WHERE ile filtre uygular. Tüm veriyi çekip client'ta filtre etme.

**Rationale**:
- 500 satır @ 50kb network transfer + client filter ≈ 100ms iyi olur ama:
- Server-side filter SQL index'lerden faydalanır (003'te `supplier_orders(supplier_id, ordered_at DESC)` index var).
- Daha "doğru" mimari; veri büyürse client tarafı şişmez.

**Alternatives considered**:
- **All-fetch + client filter**: hızlı ama 1000+ satır için ölçeklenmez.

---

## Sonuç

12 karar konsolide. "Modal vs sayfa" detay kararı R-004'te ayrı sayfa olarak çözüldü; spec FR-011'deki açık karar netleşti. Phase 1'e (data-model + contracts + quickstart) hazır.
