# Teknik Gotcha'lar ve Bilinen Sorunlar

## Nasıl kullanılır

Geliştirme sırasında keşfedilen, sonraki oturumda bilmen gereken
teknik tuzaklar, sürprizler ve dikkat edilmesi gereken noktalar buraya kaydedilir.

Agent'lar bu dosyayı şu durumlarda günceller:
- Beklenmedik bir davranış keşfedildiğinde
- Bir hatanın kök nedeni bulunduğunda
- Belirli bir kütüphane veya altyapıyla ilgili kritik bilgi öğrenildiğinde
- "Bunu daha önce bilseydim saatlerimi kurtarırdım" niteliğinde bilgi

## Format

```
### [Kısa başlık]
- **Tarih:** YYYY-MM-DD
- **Konu:** Frontend / Backend / Mobil / Veritabanı / Altyapı / Tooling
- **Detay:** Ne oluyor ve neden oluyor?
- **Çözüm/Önlem:** Nasıl ele alınmalı?
```

---

## Kayıtlar

### `next lint` Next.js 16'da kaldırılıyor
- **Tarih:** 2026-05-16
- **Konu:** Tooling
- **Detay:** `npm run lint` çalıştırıldığında uyarı çıkıyor: `next lint is deprecated and will be removed in Next.js 16`. Şu an için çalışıyor ama ileride `next lint` yerine doğrudan `eslint .` (veya `npx eslint`) çağırmamız gerekecek.
- **Çözüm/Önlem:** Next.js 16 yükseltmesinde migration: `npx @next/codemod@canary next-lint-to-eslint-cli .`. `package.json` script'i `eslint .`'e dönüşür. Şimdilik aciliyeti yok; not olarak tutuluyor.

### Server Action + `useActionState` ile prevState kullanımı
- **Tarih:** 2026-05-16
- **Konu:** Frontend / React 19
- **Detay:** React 19 `useActionState` hook'u Server Action'a `(prevState, formData)` imzasıyla çağrı yapar. Eski stil `(formData)` Server Action ile uyumlu değil. `LoginForm` → `signIn(prevState, formData)` imzasını kullanır; aksi takdirde TypeScript hata vermese de runtime'da `formData` undefined olur.
- **Çözüm/Önlem:** Server Action başında `_prevState: ...State` parametresi tanımla; hook tarafında `useActionState<State, FormData>(action, initialState)` formatını koru.

### Türkçe karakter — UTF-8 her yerde
- **Tarih:** 2026-05-16
- **Konu:** i18n
- **Detay:** Next.js 15 + Tailwind 4 + React 19 stack'inde TR karakterler (`ı, İ, ş, ğ, ç, ö, ü`) hem JSX'te hem HTML meta'da hem form input'unda sorunsuz render oluyor; <html lang="tr"> ve UTF-8 default'u yeterli. Şifrede TR karakter de Supabase Auth tarafından sorun yaşatmıyor (HTTP body UTF-8 default).
- **Çözüm/Önlem:** Özel önlem gerekmiyor; ancak email collation arama yaparken `pg_trgm` yerine `pg_trgm + unaccent` kombinasyonu ileride lazım olabilir (henüz arama yok).

### Playwright Chromium binary cache konumu
- **Tarih:** 2026-05-16
- **Konu:** Tooling / Scraper
- **Detay:** `npx playwright install chromium` ~150 MB Chromium binary'sini `~/Library/Caches/ms-playwright/` (macOS) altına indirir. node_modules'de değil, ortak cache. Bir kez kurulur. CI'da (sonraki feature) cache key olarak playwright version + OS kullanılır.
- **Çözüm/Önlem:** Yeni geliştirici ortamında script ilk çalıştırılırken `Executable doesn't exist` hatası verirse `npx playwright install chromium` çalıştırılır.

### Scraper selector'ları "best guess" — gerçek site keşfi sonrası daralt
- **Tarih:** 2026-05-16
- **Konu:** Scraper / 002
- **Detay:** `scripts/scrape/constants.ts`'teki `LOGIN_SELECTORS`, `ORDER_LIST_SELECTORS`, `PRODUCT_DETAIL_SELECTORS` aday array'leri yaygın pattern'ları içerir ama b2b.enderyapi.com.tr'nin gerçek DOM yapısı keşfedilmemiştir (kod yazarken canlı siteyi göremedim). İlk koşmada `--verbose` ile hangi selector eşleştiği log'a yansır. Selector listesi daralarak sabitlenmeli.
- **Çözüm/Önlem:** PoC sonrası "winning selector"ları array'in başına taşı; veya pragmatik olarak tek sabit selector'a indir. Çok aday selector → ilk koşmaları yavaşlatabilir (her birini test ediyor).

### TR fiyat parse edge case'i: sadece nokta + 3 hane = binlik mi ondalık mı?
- **Tarih:** 2026-05-16
- **Konu:** i18n / Scraper
- **Detay:** `"1.234"` formatı belirsiz: Türkiye'de binlik (1234) ama US format'ta ondalık (1.234). `parseTrPrice` pragmatik kural kullanır: 3 haneli son grup varsa binlik kabul. `"1.5"` → ondalık (1.5), `"1.234"` → binlik (1234). Tek başına yanlış pozitif olabilir; gerçek veriden gözlemleyip ayarla.
- **Çözüm/Önlem:** Eğer scraper testinde fiyatlar yanlış yorumlandıysa (örn. 1.234 ₺ → 1234 görünmeli ama 1.234 olarak parse edildi), `price-parse.ts`'i ayarla.

### b2b.enderyapi.com.tr — site yapı bulguları (PoC sonucu)
- **Tarih:** 2026-05-16
- **Konu:** Scraper / Site keşfi
- **Detay:** PoC çalıştırması sırasında öğrenilen yapı:
  - **Frontend:** SPA (React veya Vue muhtemel) — "Bu site B2B Store altyapısını kullanmaktadır" footer'ı var
  - **Login URL:** `https://b2b.enderyapi.com.tr/login`
  - **Login form selector'ları:** `input[id*="user" i]` (username), `input[type="password"]`, `button:has-text("Giriş Yap")` (submit)
  - **Login akışı:** AJAX submit → "Giriş yapılıyor..." spinner → JS redirect (≈3-5 sn). `domcontentloaded` yetmez, **URL change** veya **networkidle** beklemek şart.
  - **Sipariş listesi URL:** `/tr` (login sonrası ana sayfa) veya `/siparislerim` benzeri
  - **Sipariş satırı içeriği:** `sipariş_no (ESP018xxxx-ESP019xxxx) — durum (Onaylandı/Onay bekliyor) — tarih (DD.MM.YYYY) — toplam_tutar (₺)`. ÜRÜN değil, **sipariş özeti**.
  - **Sipariş detay URL'i:** `/tr/siparis-detay?id=<numerik-id>` (örn. `id=45007505`). Sipariş içindeki ürün satırları burada.
  - **Ürün katalog URL'i:** Henüz keşfedilmedi. 003+ feature'da gerekiyor: ürün kodu → katalog sayfası → güncel birim fiyat.
- **Çözüm/Önlem:** 003'te schema iki-seviyeli yapıyı yansıtmalı (orders + order_items). 004'te scraper iki drill-down + bir katalog ziyaret yapacak.

### Playwright SPA timing — `domcontentloaded` yetersiz
- **Tarih:** 2026-05-16
- **Konu:** Tooling / Scraper
- **Detay:** SPA siteler submit/navigation sonrası DOM'u JS ile yeniler. `page.goto({ waitUntil: "domcontentloaded" })` HTML iskeleti yüklenir yüklenmez döner; bizim ihtiyacımız olan içerik (login redirect, fiyat değerleri, vb.) henüz JS ile basılmamıştır.
- **Çözüm/Önlem:** Üç pattern:
  1. **URL change:** `page.waitForURL((url) => !url.includes("/login"), { timeout: 15000 })` — başarılı yönlendirmeyi yakalar
  2. **Network idle:** `page.waitForLoadState("networkidle", { timeout: 10000 })` — XHR'lar dindiğinde
  3. **Spesifik element:** `page.waitForSelector(".dashboard-loaded", { timeout: 10000 })` — bilinen bir element render olduğunda
  4. Genelde 1 + 2'yi try/catch ile chain etmek robust olur. `enderyapi.ts`'te bu pattern var.

### Supabase RLS + authenticated role: `GRANT` zorunlu, RLS tek başına yetmiyor
- **Tarih:** 2026-05-16
- **Konu:** Backend / Supabase / RLS
- **Detay:** Yeni bir tablo `CREATE TABLE ... ; ALTER TABLE ... ENABLE ROW LEVEL SECURITY` ile kurulduğunda, **table-level privilege**'lar (`SELECT/INSERT/UPDATE/DELETE`) `authenticated` role'a otomatik verilmez. RLS politika ekleyip kullanıcı oturum açsa bile `42501 permission denied for table X` alır — RLS hiç değerlendirilmez bile, privilege check önce yapılır. Bu davranış MCP `apply_migration` ile aynı; psql ile de aynı. Default Supabase davranışı değil — bizim 001'de uyguladığımız `revoke_rls_auto_enable_from_public` migration'ı `public` ve `auth` rollerinden privilege'ları çekti, ama `authenticated`'a açıkça GRANT vermek lazım.
- **Çözüm/Önlem:** Her yeni tablo migration'ından sonra (veya en geç policy migration'ı ile beraber) şu pattern'i ekle:
  ```sql
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table> TO authenticated;
  GRANT EXECUTE ON FUNCTION public.<rpc_fn>(<args>) TO authenticated;
  ```
  Önemli düzeltme (004'te keşfedildi): `service_role` "zaten herşeye erişir" varsayımı YANLIŞ — 001'deki `revoke_rls_auto_enable_from_public` migration'ı `service_role`'den de table-level privilege'ları çekti. Scraper service_role ile bağlanıyor ve `42501 permission denied for table suppliers` alıyordu. Çözüm: `service_role`'e de açıkça GRANT (004'te `20260516202902_grant_table_privileges_to_service_role.sql`). `anon`'a GRANT vermiyoruz (defense in depth). Her yeni tablo için **3 grant** lazım: authenticated + service_role (RLS bypass için doğal yetki yok!) + sometimes service_role function'lara EXECUTE.

### `auth.uid()` RLS policy'lerinde re-evaluate ediliyor — `(select auth.uid())` ile sar
- **Tarih:** 2026-05-16
- **Konu:** Backend / Supabase / Performance
- **Detay:** RLS policy içinde `auth.uid()` (veya `current_setting()`) doğrudan kullanılırsa Postgres her satır için bu fonksiyonu yeniden çağırır → büyük tablolarda ciddi yavaşlama. Supabase advisor `auth_rls_initplan` (lint 0003) bu yüzden WARN basıyor.
- **Çözüm/Önlem:** `auth.uid() IS NOT NULL` yerine `(select auth.uid()) IS NOT NULL` yaz. Postgres bunu InitPlan olarak optimize eder, fonksiyon query başına 1 kez çağrılır. 003'te `20260516154507_rls_policies_optimize_auth_calls.sql` ile 20 policy düzeltildi (DROP + CREATE pattern; Postgres ALTER POLICY ... USING desteklemez).

### `function_search_path_mutable` — her PL/pgSQL function'a `SET search_path` ekle
- **Tarih:** 2026-05-16
- **Konu:** Backend / Supabase / Security
- **Detay:** Postgres function `search_path` set etmezse, çağıran kullanıcının `search_path`'ini kullanır. Bu, eğer fonksiyon `SECURITY DEFINER` ise privilege escalation'a, `SECURITY INVOKER` ise davranış belirsizliğine yol açabilir. Supabase advisor `function_search_path_mutable` (lint 0011) WARN basar.
- **Çözüm/Önlem:** Her function tanımına `SET search_path = public, pg_temp` ekle:
  ```sql
  CREATE OR REPLACE FUNCTION public.foo(...)
  RETURNS ...
  LANGUAGE plpgsql
  SET search_path = public, pg_temp     -- bu satır
  AS $$ ... $$;
  ```
  003'te `set_updated_at()` ve `record_price_observation()` ikisinde de aktif.

### Adapter pattern + DB layer ayrımı: writer modülü tek source of truth
- **Tarih:** 2026-05-16
- **Konu:** Scraper / Mimari
- **Detay:** 004'te kurulan adapter mimarisi: `lib/scraper/adapters/<slug>.ts` saf veri çıkarır (Playwright + parse), DB'yi bilmez. DB yazma `lib/scraper/supabase-writer.ts`'de toplanır; service_role client tek yerde initialize edilir. Orchestrator (`scripts/scrape/run.ts`) ikisini birleştirir. Bu ayrım: (1) adapter'lar mock'lanabilir; (2) secret yönetimi merkezi (servis_role client tek modülde); (3) yeni adapter eklemek minimum cognitive yük (login + 3 parser metodu, DB knowledge yok).
- **Çözüm/Önlem:** Yeni adapter eklerken DB'ye yazma kodu YAZMA. Sadece interface'i implement et, summary nesnesi orchestrator'a teslim et.

### Postgres CTE snapshot — DELETE returning + SELECT order_items hatalı sonuç verir
- **Tarih:** 2026-05-16
- **Konu:** Backend / Postgres
- **Detay:** Tek statement içinde `WITH del AS (DELETE ... RETURNING id) SELECT count(*) FROM child WHERE order_id IN (SELECT id FROM del)` yaparsanız, alt SELECT child tablosunun **DELETE'ten önceki snapshot'ını** okur (Postgres docs: "All the statements are executed with the same snapshot"). Dolayısıyla CASCADE delete tetiklenip child satırlar silinse bile count > 0 görünür — yanıltıcı.
- **Çözüm/Önlem:** CASCADE doğrulamasını **iki ayrı statement'ta** yap: önce `DELETE ... RETURNING id` (gerçek silme), sonra `SELECT count(*) FROM child` (yeni snapshot). 003 QS-04 testinde bu davranış gözlemlendi; ikinci SELECT 0 döndü.

### Next.js 15 — `params` ve `searchParams` artık Promise
- **Tarih:** 2026-05-17
- **Konu:** Frontend / Next.js 15
- **Detay:** App Router'da Page Component props'larında `params` ve `searchParams` Next.js 15'te **Promise** oldu — `await` etmeden kullanılamaz. Eski `{ params }: { params: { id: string } }` deseni TS hatasına / runtime crash'e yol açar.
- **Çözüm/Önlem:**
  - Tip: `params: Promise<{ id: string }>` ve `searchParams: Promise<Record<string, string | string[] | undefined>>`
  - Kullanım: `const { id } = await params;` veya `const sp = await searchParams;`
  - 005 feature'da `app/(app)/dashboard/page.tsx` ve `app/(app)/dashboard/orders/[id]/page.tsx` bu desene göre yazıldı.

### Supabase REST native DISTINCT desteklemiyor
- **Tarih:** 2026-05-17
- **Konu:** Backend / Supabase JS
- **Detay:** PostgREST `SELECT DISTINCT col FROM table` yapmıyor; `.select("col")` her satır için satır döner. Filter dropdown'ları için distinct değer listesi gerekirken bu sınırlama can sıkar.
- **Çözüm/Önlem:** Küçük tablo (< ~5000 satır) için: tüm değerleri çek, JS'te `new Set()` ile tekleştir + `Array.from(set).sort()`. 005'te `listDistinctStatuses()` bu deseni kullanıyor. Büyüme noktası: bir RPC fonksiyonu (`get_distinct_statuses()`) veya materialized view tanımla.

### Schema reality vs spec — kolon adları doğrula
- **Tarih:** 2026-05-17
- **Konu:** Backend / Supabase
- **Detay:** 006 implementasyonunda iki sürpriz çıktı: (1) `price_snapshots` tablosunda `observed_at` değil **`captured_at`** kolonu var (data-model.md'de yanlış yazıldı); (2) `products` tablosunda **`brand` kolonu hiç yoktu**. Spec doküman planlanan schema'yı varsayıyordu ama gerçek 003 migration farklı isimlendirme + alanlar kullanmıştı.
- **Çözüm/Önlem:** Migration yazmadan / RPC SQL kurmadan önce **gerçek DB schema'sını teyit et**: `mcp__supabase__execute_sql("SELECT column_name FROM information_schema.columns WHERE table_name='X' ORDER BY ordinal_position;")`. data-model.md "planlanan" şeklini gösterir; gerçek schema "what is" durumunu. Faz 1 setup task'larından biri **schema diff** kontrolü olmalı.

### Next.js 15 + ESLint `react/no-unescaped-entities` JSX'te apostrof yasaklıyor
- **Tarih:** 2026-05-17
- **Konu:** Frontend / Next.js 15 / ESLint
- **Detay:** JSX text içinde `'` (apostrof) doğrudan yazmak (`snapshot'ı`, `kataloğundan'a`) `react/no-unescaped-entities` ESLint hatası verir; `next build` durur. Türkçe metinlerde sık karşılaşılır.
- **Çözüm/Önlem:** `&apos;` veya `&#39;` ile escape et: `snapshot&apos;ı`. JS template literal içinde (`{` `}`) bu kural çalışmaz, sadece JSX text. Alternatif: kuralı eslintrc'de kapat (önerilmez).

### PostgreSQL RPC pencere fonksiyonu — ürün başına eski/yeni snapshot
- **Tarih:** 2026-05-17
- **Konu:** Backend / Postgres
- **Detay:** "Son N gün içinde fiyatı değişen ürünleri listele" sorgusunda her ürün için iki snapshot karşılaştırılması gerek (pencerenin başındaki + sonundaki). Naif yaklaşım her ürün için iki ayrı query (n+1 problemi) veya tüm snapshot'ları JS'e çek + grupla (transfer + memory). En temiz yol: `ROW_NUMBER() OVER (PARTITION BY product_id ORDER BY captured_at ASC/DESC)` ile CTE'de `rn=1 (latest)` + `rn=1 ASC (oldest)` projection.
- **Çözüm/Önlem:** 006'da `get_price_changes(window_days)` RPC fonksiyonu bu deseni kullanıyor — bkz. `supabase/migrations/<ts>_create_get_price_changes_rpc.sql`. `SECURITY INVOKER + SET search_path = public, pg_temp` zorunlu (003/004 deseni).
