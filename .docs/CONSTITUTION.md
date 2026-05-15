# Eker-Ticaret — Constitution
_Oluşturulma: 2026-05-15 | Son güncelleme: 2026-05-15_
_Profil: web-fullstack_

## Proje özeti
- **Proje:** Eker-Ticaret
- **Amaç:** _Bu projenin neyi çözdüğünü tek paragrafta yaz_
- **Hedef kullanıcı:** _Kim kullanacak?_

## Teknik stack
_Profil overlay'i bu bölümün altına ek yapar. Manuel düzenleme yapmadan önce alttaki Stack Detayları bölümünü oku._

### Genel kararlar
- **Dil:** TypeScript (frontend) / TBD (backend)
- **Test:** Vitest veya profil önerisi
- **Lint:** ESLint + Prettier
- **CI:** TBD (GitHub Actions / Vercel / Render)

### Stack detayları
_Profil overlay'inden gelir_

## Geliştirme standartları

### Kod standartları
- Naming: kebab-case (dosya/klasör), PascalCase (component class/tip), camelCase (değişken/fonksiyon)
- Magic number/string yasak — `const` veya enum kullan
- Public fonksiyonlar için kısa JSDoc/TSDoc (sadece "why" gerekirse)
- Yorumlar açıklayıcı değil bağlam vermek için (kod kendini açıklamalı)

### Mimari kurallar
- Business logic UI'dan ayrı tutulur (service/store katmanı)
- API çağrıları sadece service katmanından
- Component'lar veriyi prop/store üzerinden alır, doğrudan fetch yapmaz
- Her özelliğin testi yazılır (kritik path için zorunlu)

### Güvenlik
- API key ve secret'lar kaynak kodda olmaz (`.env`, vault)
- Input validation her external boundary'de (form, API)
- Auth gerektiren endpoint'ler middleware ile korunur

### Hata yönetimi
- Global error handler/boundary tanımlı
- Hatalar yapılandırılmış formatta loglanır (Pino, console kabul)
- Kullanıcıya teknik detay gösterilmez

## i18n / Dil
- **Birincil dil:** Türkçe / İngilizce (proje açılışında seç)
- **Türkçe karakter desteği:** _Etkin / Pasif_ — etkinse `ı, İ, ş, Ş, ç, Ç, ğ, Ğ, ö, Ö, ü, Ü, â, î, û` her yerde test edilmeli (collation, encoding, sort)

## Mimari kararlar
_Her kararın tarihi ve gerekçesi tutulur_

| Tarih | Karar | Gerekçe |
|-------|-------|---------|
| 2026-05-15 | Proje başlatıldı | — |

## Kısıtlar ve özel durumlar
_Geliştirme sırasında ortaya çıkan kısıtlar buraya eklenir_

- [ ] Henüz tanımlanmadı

## Açık sorular
_Cevabı henüz netleşmemiş kararlar_

- [ ] Deployment hedefi (Vercel / self-hosted / mobile store)
- [ ] Analytics / izleme tercihleri

## Figma Tasarım Referansı
_Proje tasarımı varsa bu bölüm doldurulur, yoksa silinir_

- **Figma File URL:** —
- **Figma API Key:** `.mcp.json` dosyasında tanımlı (repo'ya girmez)

### Tasarım kullanım kuralları
- Geliştirme sırasında Figma tasarımından sapılmaz
- Renk, spacing ve tipografi değerleri Figma'dan alınır
- Tasarımda tanımlı olmayan bir UI kararı için varsayım yapılmaz, kullanıcıya sorulur
- Figma tasarımı olan feature'larda frontend implementasyonu sonrası ui-ux-agent ile uyum kontrolü yapılır (maks. 3 iterasyon)

## Toplantı/iletişim geçmişi
_Müşteri/paydaş görüşmesi varsa buraya not düşülür_

| Tarih | Konu | Dosya |
|-------|------|-------|
| — | — | — |

<!-- ============================================ -->
<!-- Profil overlay: web-fullstack -->
<!-- ============================================ -->

## Stack Detayları (web-fullstack profili)

### Frontend
- **Framework:** Next.js 14+ (App Router)
- **Dil:** TypeScript (strict mode)
- **UI:** Tailwind CSS + shadcn/ui (opsiyonel, ihtiyaç olursa)
- **Form:** react-hook-form + zod
- **State:** React state default; karmaşık global state için Zustand
- **Data fetching:** Server Components (default), @tanstack/react-query (client tarafında gerekirse)
- **İkonlar:** lucide-react

### Backend
- **Database & Auth:** Supabase (Postgres + Supabase Auth)
- **API:** Next.js Route Handlers (`app/api/*`) veya Supabase Edge Functions
- **ORM:** Supabase client (server tarafında `createClient` ile)
- **Migration:** Supabase CLI (`supabase migration new`, `supabase db push`)
- **Auth:** Supabase Auth (magic link veya email/password); RLS (Row Level Security) zorunlu

### Klasör yapısı
```
app/                        # Next.js App Router
  (marketing)/              # Public route group
  (app)/                    # Authenticated route group
  api/                      # Route handlers
  layout.tsx
  page.tsx
components/
  ui/                       # shadcn veya base UI primitives
  features/                 # Feature-specific component'ler
lib/
  supabase/
    client.ts               # Browser client
    server.ts               # Server client
    middleware.ts           # Auth middleware
  validations/              # zod schemas
  utils.ts
supabase/
  migrations/               # SQL migration'lar
  seed.sql
public/
```

### Deployment
- **Platform:** Vercel
- **Environment variables:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (sadece server tarafında)
- **CI:** Vercel preview deployments (PR başına otomatik)

### Test
- **Unit:** Vitest
- **Component:** Vitest + Testing Library
- **E2E:** Playwright (opsiyonel)

### Kod konvansiyonları
- Server Component default; client component sadece interaktivite için (`"use client"` direktifi)
- API çağrıları service module'lerinde: `lib/supabase/queries/*.ts`
- Form validation zod schema, hem client hem server'da paylaşılır
- Database query'leri Server Component veya Route Handler'da; client'tan direkt Supabase çağrısı sadece anlık veriler için
- RLS policy yazılmadan tabloya erişim engellenmeli

### Güvenlik
- `SUPABASE_SERVICE_ROLE_KEY` sadece server-side, asla client'a sızmaz
- RLS policy her tablo için zorunlu
- Form input'ları zod ile valide edilir hem client hem server'da
- `next.config.js` CSP header'ları (production için)

### Performans
- Image: Next.js `<Image>` componenti
- Font: `next/font` ile self-host
- Bundle analiz: `@next/bundle-analyzer`
- Server Component'ları tercih et (client bundle'ı küçük tut)

### Önerilen paketler
```
next, react, react-dom
@supabase/supabase-js, @supabase/ssr
typescript, @types/node, @types/react
tailwindcss, postcss, autoprefixer
zod, react-hook-form, @hookform/resolvers
lucide-react
vitest, @testing-library/react, @testing-library/jest-dom
```
