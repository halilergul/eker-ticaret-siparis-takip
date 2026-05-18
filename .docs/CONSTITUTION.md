# Eker-Ticaret — Constitution
_Oluşturulma: 2026-05-15 | Son güncelleme: 2026-05-15_
_Profil: web-fullstack_

## Proje özeti
- **Proje:** Eker-Ticaret Takip Dashboard
- **Amaç:** Nalbur işletmesi Eker Ticaret'in tedarikçi B2B sitelerinden toptan satın aldığı ürünlerin, satın alma sonrası fiyat değişimini (özellikle zamları) takip eden bir dashboard. Tedarikçi sipariş geçmişindeki alış fiyatı ile B2B sitedeki güncel fiyat karşılaştırılır; zamlı ürünler öne çıkarılır.
- **Hedef kullanıcı:** Eker Ticaret'in tek bir çalışanı/sahibi (kişisel kullanım, paylaşım yok).
- **V1 kapsam:**
  - Birden fazla B2B tedarikçi sitesine login + scrape (ilk hedef: `b2b.enderyapi.com.tr`)
  - Sipariş geçmişi / faturalardan ürün + alış fiyatı + tarih çekme (manuel giriş yok)
  - Güncel B2B fiyatları periyodik (günde 1) çekme + manuel "şimdi güncelle" tetiği
  - Zamlı ürünleri öne çıkaran liste; ürün bazlı fiyat değişim geçmişi
  - Otomatik scrape ayarı: kullanıcı saatini seçer, açıp kapatabilir
- **V1 anti-goal'ler:** Stok takibi, satış/POS, müşteri yönetimi, çoklu kullanıcı/rol, mobil native — **YOK**.

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
- **Birincil dil:** Türkçe (tek kullanıcı, TR pazar, TR tedarikçiler)
- **Türkçe karakter desteği:** **Etkin** — `ı, İ, ş, Ş, ç, Ç, ğ, Ğ, ö, Ö, ü, Ü, â, î, û` her yerde test edilmeli (collation, encoding, sort, ürün adı arama)

## Mimari kararlar
_Her kararın tarihi ve gerekçesi tutulur_

| Tarih | Karar | Gerekçe |
|-------|-------|---------|
| 2026-05-15 | Proje başlatıldı | — |
| 2026-05-15 | Stack: Next.js 14 (App Router) + Supabase + Vercel + GitHub Actions | `web-fullstack` profil default'u; hepsi free tier'da kalıyor, sıfır maliyet hedefi tutuyor |
| 2026-05-15 | Scheduled scrape job **GitHub Actions** üzerinde, Vercel Cron değil | Playwright binary boyutu/timeout Vercel Functions sınırlarını aşar; GitHub Actions free tier (2.000 dk/ay) tek kullanıcı/günlük scrape için bol bol yeter |
| 2026-05-15 | Çoklu B2B site için **adapter mimarisi** | Her tedarikçi site (login akışı, sipariş geçmişi sayfası, ürün sayfası selector'ları) ayrı modül; yeni site eklemek = yeni adapter; UI değişmez |
| 2026-05-15 | İlk hedef site: `b2b.enderyapi.com.tr` | Kullanıcının kullandığı ilk tedarikçi; diğer siteler sırayla adapter olarak eklenecek |
| 2026-05-15 | Sipariş verisi B2B sitenin sipariş geçmişi/faturalarından scrape edilir | Manuel veri girişi V1'de yok; tek hakikat kaynağı tedarikçi sisteminin kendisi |
| 2026-05-15 | B2B kimlik bilgileri **GitHub Secrets**'ta encrypted saklanır | Server-side scrape için gerekli; Supabase Vault da seçenek ama Actions ortamı için Secrets daha doğal |
| 2026-05-15 | Auth: Supabase Auth, tek kullanıcı, magic link veya email/password | Public web'de dashboard'un açık durmaması için basit koruma |
| 2026-05-15 | Otomatik scrape ayarı (saat + on/off) DB'de tutulur, GitHub Action saatlik tetiklenip kontrol eder | Cron schedule'ı koddan değiştirmek yerine UI'dan ayarlanabilirlik için |
| 2026-05-17 | 007: Manuel "Şimdi tetikle" Server Action → GitHub `workflow_dispatch` API ile çalışır (Vercel env'inde fine-grained PAT) | Son kullanıcı (Eker Ticaret çalışanı, sıfır teknik) terminal kullanmaz; tek-tıkla UI üzerinden tetikleme zorunlu |
| 2026-05-17 | 007: `scrape_schedule` tablosu (per-supplier `enabled` + `daily_hour_utc`) + saatlik cron + DB hour-gating | UI'dan ayarlanabilir; cron sabit, schedule DB'de — workflow file redeploy gerekmez |
| 2026-05-17 | 007: B2B credentials + Supabase service role key **GitHub Repo Secrets**'a göç ettirildi | G15 prensibinin uygulanması; `.env.local` artık yalnızca dev için (B2B değerleri kaldırıldı) |
| 2026-05-17 | 008: İkizler Hırdavat (`http://bayi.ikizlerhirdavat.com`) HTTP plaintext credential riski **kabul edildi** | Site HTTPS sertifikası sunmuyor; kullanıcı (Eker) açıkça kabul etti (spec FR-012). Ek mitigation yok; B2B kredensiyeli yalnız bu site için HTTP üzerinden gönderiliyor. |
| 2026-05-17 | 008: Per-adapter constants dosyası pattern'i — `lib/scraper/adapters/<slug>.constants.ts` | İkinci ve üçüncü tedarikçi adapter'ı eklerken `scripts/scrape/constants.ts` (enderyapı-gömülü) namespace çatışması yarattı. Her adapter ile yan yana dosya: site-spesifik selector havuzu, base URL, login path'leri vb. Adapter dosyasının okunabilirliği korunur, yeni site eklemek minimal değişiklik. Eski `constants.ts` enderyapı için geriye-uyumlu olarak kalır. |
| 2026-05-18 | 009: `writePriceSnapshot` idempotency — aynı fiyat → no-op | 006'dan beri writer doğrudan INSERT yapıyordu (RPC `record_price_observation`'ın aksine). Catalog scrape ardarda 2 kez koşunca her ürün için 2 satır snapshot oluşuyordu. Düzeltme: writer son snapshot'ı `unit_price` ile karşılaştırır; aynıysa skip + `{ inserted: false }` döner. Schema `price_snapshots.unit_price = numeric(14,2)` olduğu için JS tarafında `Number(price.toFixed(2))` normalize zorunlu. |
| 2026-05-18 | 009: Catalog hata izolasyonu — orders fazını engellemez | Orchestrator (`scripts/scrape/all.ts`) catalog phase'i ayrı try/catch ile izole ediyor; selector kırılması, parse fail veya timeout durumunda orders phase bağımsız tamamlanır (spec FR-007 + SC-005). Run status "Kısmen başarılı" olabilir; orders verisi kayıp olmaz. |
| 2026-05-18 | 009: `products.barcode` kolonu + barkod fallback search | Levent Şimşek site search muhasebe kodlarıyla unique değil (S001 → 4+ sonuç, yanlış ürün ilk sırada). Modal'daki "Barkod: 212102590" pattern parse edilir, `products.barcode`'a UPSERT yazılır, catalog scrape barkod öncelikli search yapar. Schema değişikliği opsiyonel (nullable kolon, eski tedarikçilerle uyumlu). |
| 2026-05-18 | 009: KDV default %20 fallback (catalog scrape) | Catalog sayfasında KDV oranı parse edilemediği zaman adapter %20 ile snapshot döner (Enderyapı + İkizler + Levent ortak default). Log satırı düşülür ki kullanıcı varsayım olduğunu görebilir. Heterojen KDV oranları (8/18/20) explicit parse edilebilirse override edilir. |
| 2026-05-18 | 009: GH Actions `exit 78` → `GITHUB_OUTPUT` gating | `check-schedule.ts` artık her zaman exit 0; skip kararı output dosyasına `skip=true|false` yazılır. Workflow `if: steps.check.outputs.skip == 'false'` ile gate'lenir. Sebep: GH Actions 2020 sonrası exit 78'i failure olarak işaretliyor → saatlik cron'lar mail spam yapıyordu (günde ~22 mail). |

## Kısıtlar ve özel durumlar
_Geliştirme sırasında ortaya çıkan kısıtlar buraya eklenir_

- **Sıfır maliyet:** Tüm bileşenler free tier'da kalmalı. Free tier'ı aşma riski olan kararlar için kullanıcıya alternatif sunulur (örn. GitHub Actions dk kotası dolma riski → scrape sıklığı düşürme).
- **Tek kullanıcı:** Çoklu kullanıcı/rol/permission mimarisi V1'de yok; ileride eklenirse RLS politikaları buna göre genişletilecek.
- **B2B siteler login arkasında:** Tüm scraping authenticated session ile yapılır; anonim ürün sayfaları kullanılmaz (liste fiyat ≠ kullanıcıya özel iskonto sonrası fiyat).
- **Site DOM değişimi kırılma noktası:** Her adapter için sağlam selector'lar + parse hatalarını yakalama + son başarılı çekim zamanı + son hata mesajı kayıt altında.
- **CORS gerçeği:** B2B siteye doğrudan tarayıcıdan istek atılamaz; tüm fetch'ler GitHub Actions runner'ı (Playwright) üzerinden server-side yapılır.
- **Şifre güvenliği:** B2B kullanıcı/şifresi sadece encrypted secret olarak GitHub'da; commit log'una/repo'ya/issue'ya asla yazılmaz.

## Açık sorular
_Cevabı henüz netleşmemiş kararlar_

- [x] ~~Deployment hedefi~~ → Frontend: **Vercel**; Scrape job: **GitHub Actions**
- [ ] Analytics / izleme tercihleri (V1'de muhtemelen gerekmiyor; tek kullanıcı)
- [ ] Auth yöntemi: magic link mi email/password mi? (`/speckit-specify` aşamasında netleşir)
- [ ] Eklenecek diğer B2B siteleri listesi (kullanıcı zamanı geldikçe ekleyecek)
- [x] ~~Fiyat değişim eşiği~~ → **Eşik yok**. En küçük değişim bile gösterilir. (2026-05-17 kararı, kullanıcı tercihi)
- [ ] Bildirim: zamlı ürün tespit edilince e-posta/push mı, sadece dashboard üzerinde mi? (V1 muhtemelen sadece dashboard)

## Tasarım Yaklaşımı
- **Figma yok.** UI/UX kararları her feature öncesi `ui-ux-agent` tarafından `.docs/UIUX-NNN.md` olarak yazılacak (renk, tipografi, spacing, component pattern'ları).
- frontend-agent UIUX dokümanını referans alır; sapma olmaz.
- Implementasyon sonrası ui-ux-agent uyum kontrolü yapar (maks. 3 iterasyon).

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
  (auth)/                   # Login route group
  (app)/                    # Authenticated dashboard route group
  api/                      # Route handlers (manuel scrape tetiği, vb.)
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
src/
  scraper/
    adapters/               # Her B2B site için ayrı adapter modülü
      enderyapi.ts          # b2b.enderyapi.com.tr
      <site>.ts             # ileride eklenecek diğer siteler
    common/                 # Ortak Playwright helpers, login flow
    index.ts                # CLI entry: tüm aktif site'leri scrape eder
supabase/
  migrations/               # SQL migration'lar
  seed.sql
.github/
  workflows/
    scrape.yml              # Saatlik tetik + manuel dispatch
public/
```

### Scheduled Scrape Job (proje-spesifik ek)
- **Çalışma yeri:** GitHub Actions (Vercel Cron değil — Playwright sığmaz)
- **Sıklık:** Saatte 1 tetiklenir; her tetikte DB'deki kullanıcı ayarına (saat + on/off) bakar, uyuyorsa kendi kendini durdurur
- **Browser:** Playwright (Chromium, headless), `npx playwright install --with-deps chromium`
- **Çıktı:** Sonuçlar Supabase'e yazılır (`price_snapshots` veya benzeri tablo)
- **Manuel tetik:** GitHub Actions `workflow_dispatch` veya frontend'den repository_dispatch ile başlatılır
- **Secrets:** `SUPABASE_SERVICE_ROLE_KEY` + her B2B site için `EKER_<SITE>_USERNAME`, `EKER_<SITE>_PASSWORD` (GitHub Repo Secrets)
- **Mimari:** `src/scraper/adapters/<site>.ts` — her tedarikçi site için ayrı adapter modülü (login, listOrders, getCurrentPrice fonksiyonları)

### Deployment
- **Platform:** Vercel (frontend)
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

# Scrape job (sadece GitHub Actions runner'ında kurulur, Vercel'e gitmez)
playwright
```
