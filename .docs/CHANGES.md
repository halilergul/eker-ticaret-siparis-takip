# Change Request Log

## Nasıl kullanılır
Her yeni talep veya kapsam değişikliği buraya kaydedilir.

## Format
```
### CR-NNN — Kısa başlık
- **Tarih:** YYYY-MM-DD
- **Talep eden:** kullanıcı / paydaş / kendi notum
- **Açıklama:** Ne isteniyor?
- **Etkilenen spec bölümleri:** spec.md satır X-Y
- **Etki analizi:** Kaç saatlik iş? Hangi modüller etkilenir?
- **Durum:** Beklemede / Onaylandı / Reddedildi / Tamamlandı
```

---

## Kayıtlar

### CR-001 — Feature 001-auth-dashboard tamamlandı
- **Tarih:** 2026-05-16
- **Talep eden:** Halil (kendi notu)
- **Açıklama:** Auth + boş dashboard iskeleti. Tek kullanıcı email+şifre ile giriş, `/dashboard` korumalı route, üst barda karşılama + çıkış butonu. Spec: [specs/001-auth-dashboard/spec.md](../specs/001-auth-dashboard/spec.md).
- **Etkilenen dosyalar:**
  - **Yeni:** `lib/routes.ts`, `lib/validations/auth.ts`, `app/(auth)/login/page.tsx`, `app/(auth)/login/actions.ts`, `app/(app)/layout.tsx`, `app/(app)/dashboard/page.tsx`, `components/features/auth/login-form.tsx`, `components/features/auth/logout-button.tsx`, `components/ui/top-bar.tsx`
  - **Değiştirilen:** `lib/supabase/middleware.ts` (route guard + Cache-Control no-store eklendi), `app/page.tsx` (sağlık kontrolünden koşullu redirect'e dönüştürüldü)
- **Etki analizi:** ~3 saat (spec + plan + research + tasks dahil), tek branch `001-auth-dashboard`, geri dönüş riski düşük. RLS politikası gerekmedi (yeni tablo yok).
- **Durum:** Tamamlandı. Manuel regression (QS-01 → QS-09) 2026-05-16'da kullanıcı tarafından geçirildi — tüm ✅.

### CR-002 — Feature 002-enderyapi-scraper-poc tamamlandı (kod)
- **Tarih:** 2026-05-16
- **Talep eden:** Halil (kendi notu)
- **Açıklama:** b2b.enderyapi.com.tr için Playwright tabanlı CLI scraper PoC. Spec: [specs/002-enderyapi-scraper-poc/spec.md](../specs/002-enderyapi-scraper-poc/spec.md).
- **Etkilenen dosyalar:**
  - **Yeni klasör/dosyalar:** `scripts/scrape/{constants,credentials,price-parse,output,errors,detection,enderyapi,README}.ts/md`
  - **Değiştirilen:** `package.json` (devDeps: playwright + tsx + dotenv; script: `scrape:enderyapi`), `.env.example` (ENDERYAPI_USERNAME, ENDERYAPI_PASSWORD), `.gitignore` (`scrape-debug/`)
- **Etki analizi:** ~4 saat (spec + plan + research + tasks + code). Next.js runtime'ına etkisi yok (scraper standalone). 3 bilinçli Constitution sapması (G2, G13, G14) plan.md → Complexity Tracking'te belgelendi; 004-005'te düzeltilecek.
- **Durum:** Tamamlandı (2026-05-16). **Senaryo A — feasibility kanıtlandı.** Login + navigation + parsing tüm üç adım çalışıyor; 20 sipariş başarıyla okundu. Site yapısı keşfedildi: SPA, iki-seviyeli (sipariş listesi → siparis-detay → ürün satırı), katalog 3. seviye. Implementation sırasında 4 küçük iterasyon yapıldı: (1) submit selector array genişletildi + Enter fallback, (2) 2FA detection sıkılaştırıldı (false positive fix), (3) SPA login için URL change wait, (4) detay sayfası için networkidle wait + verbose log. Site bulguları `dev-gotchas.md`'ye işlendi; 003'te Supabase schema'sı bu yapıya uygun (orders + order_items + products) tasarlanacak, 004'te tam scraper yazılacak.

### CR-003 — Feature 003-supabase-schema tamamlandı (kod)
- **Tarih:** 2026-05-16
- **Talep eden:** Halil (kendi notu)
- **Açıklama:** Tedarikçi sipariş ve fiyat takibi için Supabase Postgres schema'sı. 5 tablo (`suppliers`, `supplier_orders`, `order_items`, `products`, `price_snapshots`) + RLS + RPC fonksiyon (`record_price_observation`) + TypeScript type üretimi. Spec: [specs/003-supabase-schema/spec.md](../specs/003-supabase-schema/spec.md).
- **Etkilenen dosyalar:**
  - **Yeni migration'lar** (`supabase/migrations/`):
    - `20260516153627_core_tables.sql` — 5 tablo + index'ler + CHECK + FK + UNIQUE
    - `20260516153940_updated_at_trigger.sql` — `set_updated_at()` + 4 tabloya trigger
    - `20260516154009_rls_policies.sql` — RLS enable + 20 policy (4×5)
    - `20260516154039_seed_enderyapi.sql` — supplier seed
    - `20260516154251_record_price_observation.sql` — idempotent fiyat snapshot RPC
    - `20260516154431_fix_set_updated_at_search_path.sql` — advisor düzeltme
    - `20260516154507_rls_policies_optimize_auth_calls.sql` — `(select auth.uid())` ile sarma
    - `20260516154905_grant_table_privileges_to_authenticated.sql` — authenticated role'a CRUD GRANT
  - **Yeni:** `lib/supabase/database.types.ts` (Supabase MCP generate_typescript_types çıktısı)
  - **Değiştirilen:** `lib/supabase/client.ts`, `lib/supabase/server.ts` (`<Database>` generic eklendi)
- **Etki analizi:** ~3 saat (spec + plan + research + tasks + code + 8 manuel QS doğrulama + 3 advisor düzeltmesi). Constitution 14/14 ✅ — bilinçli sapma yok. 002'deki G14 (migration file-versioning) düzeltildi. Authenticated role privilege eksikliği implementation sırasında yakalandı, GRANT migration ile düzeltildi (dev-gotchas'a kaydedildi).
- **Durum:** Tamamlandı. Quickstart QS-00 → QS-08 tamamı ✅. Advisor: schema-related 0 critical (1 ek WARN `auth_leaked_password_protection` Auth Dashboard'da manuel açılır). 004 scraper artık bu schema'ya yazabilir.

### CR-004 — Feature 004-enderyapi-scraper-prod tamamlandı (kısmi)
- **Tarih:** 2026-05-16
- **Talep eden:** Halil (kendi notu)
- **Açıklama:** Multi-supplier adapter mimarisi + Enderyapi adapter + DB yazma + scrape_runs audit. Spec: [specs/004-enderyapi-scraper-prod/spec.md](../specs/004-enderyapi-scraper-prod/spec.md).
- **Etkilenen dosyalar:**
  - **Yeni klasör/dosyalar:**
    - `lib/scraper/{types,errors,adapter-registry,supabase-writer,run-logger}.ts`
    - `lib/scraper/adapters/enderyapi.ts` (PoC'tan adapter pattern'a port)
    - `scripts/scrape/run.ts` (CLI orchestrator)
  - **Yeni migration'lar:**
    - `20260516161959_scrape_runs.sql` (audit table)
    - `20260516202902_grant_table_privileges_to_service_role.sql` (003 sonrası eksik GRANT — service_role'e CRUD + RPC)
  - **Değiştirilen:**
    - `scripts/scrape/credentials.ts` — `loadCredentials(slug)` generic
    - `scripts/scrape/errors.ts` — yeni FailureMode değerleri (`db-write-failed`, `supplier-not-found`)
    - `scripts/scrape/enderyapi.ts` — deprecation banner
    - `scripts/scrape/README.md` — yeni mimari + adapter ekleme rehberi
    - `package.json` — `"scrape": "tsx scripts/scrape/run.ts"` script
    - `lib/supabase/database.types.ts` — `scrape_runs` ile regen
- **Etki analizi:** ~5 saat (spec + plan + research + tasks + code + manuel QS doğrulama). Constitution 14/15 ✅, 1 ⚠ G15 (credentials lokalde, 005'te GitHub Secrets'a taşınacak). Implementation sırasında 1 sürpriz: service_role'e GRANT eksikti (001'deki revoke migration'ından miras), düzeltme migration ile çözüldü ve dev-gotchas'a kaydedildi.
- **Kısmi tamamlandı**: P1 ✅ (sipariş geçmişi DB'de, idempotent), P3 ✅ (scrape_runs audit). **P2 ertelenmiş**: katalog DOM keşfi (T022-T025) → 005 feature'a taşındı. Sebep: ürün katalog sayfası URL pattern'ı + fiyat selector'ları henüz keşfedilmedi; GitHub Actions ortamında gerçek workflow ile birlikte yapılır. T021 (login-fail test) de ertelendi (gerçek hesap kilitleme riski).
- **Bilinen sınırlama**: `getOrderDetail` her sipariş için yalnızca 1 ürün satırı parse ediyor; muhtemelen tablo başlığı/summary satırı sayılıyor. T022 sırasında --headed mode'da düzeltilir (item parser refine).
- **Manuel doğrulama**: QS-03 ✅ (5 sipariş 13sn'de DB'ye yazıldı), QS-04 ✅ (idempotent: 2. koşumda 0 yeni), QS-06 ✅ (scrape_runs zengin), QS-08 ✅ (zero secret leak).
- **Durum**: Kısmi tamamlandı (US1 + US3 ✅, US2 → 005). MVP açısından çalışır: sipariş geçmişi DB'de, 006 dashboard feature artık başlayabilir.
