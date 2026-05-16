# Implementation Plan: Supabase Schema — Tedarikçi Sipariş & Fiyat Takibi

**Branch**: `003-supabase-schema` | **Date**: 2026-05-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-supabase-schema/spec.md`

## Summary

5 tabloluk veri katmanı: `suppliers` (B2B tedarikçi siteleri), `supplier_orders` (sipariş başlığı), `order_items` (sipariş satırı), `products` (tedarikçi katalog kaydı — güncel fiyat + son gözlem), `price_snapshots` (fiyat değişim tarihçesi). Tüm tablolar RLS-korumalı; tek kullanıcı senaryosunda "authenticated görür/yazar", `service_role` bypass yapar. Para alanları `numeric(14,2)`, zaman damgaları `timestamptz`. `(supplier_id, order_no)` ve `(supplier_id, code)` unique constraint'leri idempotent upsert için zemin sağlar. Fiyat snapshot'u yalnızca fiyat ürünün mevcut `current_unit_price`'ından farklıysa eklenir — bu PL/pgSQL fonksiyonu (`record_price_observation`) ile sağlanır, scraper tek fonksiyon çağrısıyla idempotent kayıt yapar.

Migration'lar Supabase MCP (`apply_migration`) üzerinden uygulanır, dosya kopyaları `supabase/migrations/` altında versiyonlanır. TypeScript tipleri `mcp__supabase__generate_typescript_types` ile çıkarılıp `lib/supabase/database.types.ts` olarak yazılır; mevcut `lib/supabase/{client,server}.ts` istemcileri bu tipi `<Database>` generic'i olarak kullanır. UI / scraper kodu bu feature'da yazılmaz; data layer ve type contract teslim edilir.

## Technical Context

**Language/Version**: TypeScript 5.x (mevcut), Next.js 15, React 19; Postgres 15 (Supabase managed)

**Primary Dependencies**: `@supabase/supabase-js`, `@supabase/ssr` (mevcut); yeni runtime bağımlılık yok. DDL Supabase MCP üzerinden uygulanır.

**Storage**: Supabase Postgres (proje `ptyogthdyunrzfcdlwnn`, EU bölge). Extension'lar: `pgcrypto` (kurulu — `gen_random_uuid()`), `uuid-ossp` (kurulu, kullanılmayacak), `moddatetime` (gerekirse trigger için — şu an custom trigger fonksiyonu yazılır).

**Testing**: Manuel SQL testleri Supabase SQL Editor + `execute_sql` MCP üzerinden (kapsamlı script `quickstart.md`'de). pgTAP kurulu ama bu feature için zorunlu değil; gerekirse 005+ feature'da test paketi eklenir. Vitest tabanlı tip-doğrulama testi opsiyonel.

**Target Platform**: Server (Postgres) + browser/server type consumer (Next.js). Şema her ortama uyumlu — Vercel preview ve GitHub Actions scraper'ı (004+) aynı schema'ya yazar.

**Project Type**: Web application (mevcut Next.js + Supabase yapısı) — bu feature data-layer-only.

**Performance Goals**: Tek kullanıcı, günde ~1 scrape, beklenen veri hacmi düşük (yıl içinde <10k sipariş, <50k order_item, <200k snapshot). Index'ler en sık sorguya yönelik: `supplier_orders(ordered_at DESC)`, `price_snapshots(product_id, captured_at DESC)`, `order_items(order_id)`. P95 query <50ms beklenir; tek tablo `select` <10ms.

**Constraints**: Free tier (500MB veri sınırı) — JSON blob, dosya ekleme yok; tüm fiyatlar `numeric(14,2)`; UUID PK; soft delete yok (idempotent upsert + immutable price history tasarım gereği yeterli). Tek currency (TRY) varsayımı — kolon var, enforcement minimal.

**Scale/Scope**: 5 tablo, 1 PL/pgSQL fonksiyon (`record_price_observation`), 1 trigger fonksiyon (`set_updated_at`), 5 RLS politikası seti, ~6 index, 1 seed insert. ~250 satır SQL toplam.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Gate | Kaynak | Durum | Not |
|---|------|--------|-------|-----|
| G1 | **Secrets in source code:** API key / secret kaynak kodda olmaz | CONSTITUTION → Güvenlik | ✅ PASS | Migration / seed dosyalarında hiçbir secret yok; sadece DDL + sabit slug. |
| G2 | **Service module pattern:** Veri çağrıları `lib/`'te toplanır | CONSTITUTION → Kod konvansiyonları | ✅ PASS | Bu feature DDL + type üretimi; çağıran kod (scraper / UI) sonraki feature'larda `lib/supabase/queries/` altında yazılacak. |
| G3 | **Server Component default** | CONSTITUTION → Kod konvansiyonları | ✅ PASS (N/A) | UI yok; sadece data layer. |
| G4 | **Form validation zod** | CONSTITUTION → Kod konvansiyonları | ✅ PASS (N/A) | Form yok. (Scraper input validation 004'te.) |
| G5 | **RLS zorunlu:** Yeni tabloda RLS açık | CONSTITUTION → Backend | ✅ PASS | FR-010, SC-001, SC-004 — 5 tablonun hepsinde RLS aktif + politika; advisor temiz olmalı. |
| G6 | **Türkçe i18n:** TR karakterler test edilmiş | CONSTITUTION → i18n | ✅ PASS | Tüm `text` alanlar UTF-8; `name`, `product_name`, `status` TR karakterli veriyi kayıpsız tutar (Postgres default `en_US.UTF-8` collation TR kabul eder). |
| G7 | **Tek kullanıcı kısıtı** | CONSTITUTION → Kısıtlar | ✅ PASS | RLS basit (per-user ownership değil); per-row `user_id` FK eklenmedi — tek kullanıcı varsayımıyla uyumlu. |
| G8 | **Sıfır maliyet** | CONSTITUTION → Kısıtlar | ✅ PASS | Tüm tablolar Supabase free tier (500 MB) içinde; beklenen 1 yıllık veri <50 MB. |
| G9 | **Anti-goal koruması** (multi-user / mobile / multi-tenant YOK) | CONSTITUTION → Anti-goal | ✅ PASS | Schema multi-tenant değil (tek user, multi-supplier'a izin verir ama tenant kavramı yok). |
| G10 | **Naming convention** | CONSTITUTION → Kod standartları | ✅ PASS | Tablo/kolon adları `snake_case` (Postgres idiom); type'lar PascalCase otomatik. |
| G11 | **No magic strings:** const'lar | CONSTITUTION → Kod standartları | ✅ PASS | `currency` default `'TRY'` kolon default'unda; supplier `slug` enum değil text (yeni tedarikçi eklemek migration gerektirmez). |
| G12 | **Service role secret never client-side** | CONSTITUTION → Güvenlik | ✅ PASS | Type generation MCP üzerinden yapılır; secret kullanılmaz. Scraper (004) `SUPABASE_SERVICE_ROLE_KEY` GitHub Secrets'tan okur — bu feature'a değmez. |
| G13 | **Çoklu adapter mimarisi** | CONSTITUTION → Mimari kararlar 2026-05-15 | ✅ PASS | Schema `supplier_id` FK ile multi-supplier'a açık; her tedarikçi için ayrı `suppliers` satırı; `(supplier_id, code)` unique constraint adapter pattern'ı destekler. |
| G14 | **Migration file-versioning:** Supabase migration'ları `supabase/migrations/` altında | CONSTITUTION → Stack | ✅ PASS | MCP `apply_migration` çağrısı yapılırken karşılığı SQL dosyası `supabase/migrations/<timestamp>_<name>.sql` olarak elle eklenir (drift önleme). 002'de tartışılan kısmi sapma bu feature'da düzeltiliyor. |

**Sonuç:** Tüm 14 gate ✅ PASS. Bilinçli sapma yok. (002'deki G14 sapması bu feature ile düzeltiliyor: migration dosyaları artık repo'da versiyonlanacak.)

## Project Structure

### Documentation (this feature)

```text
specs/003-supabase-schema/
├── plan.md                      # This file
├── spec.md                      # Feature spec
├── research.md                  # Phase 0 — schema tasarım kararları
├── data-model.md                # Phase 1 — tablo + ilişki detay
├── contracts/
│   └── schema-sql.md            # DDL + RPC fonksiyon kontratı
├── quickstart.md                # Phase 1 — manuel doğrulama (SC-002, SC-003, SC-004)
├── checklists/
│   └── requirements.md          # Spec quality checklist
└── tasks.md                     # Phase 2 (/speckit-tasks komutu üretir)
```

### Source Code (repository root)

```text
supabase/
├── migrations/
│   ├── 20260515203748_revoke_rls_auto_enable_from_public.sql   # var (önceki)
│   ├── 20260516_____01_core_tables.sql                          # YENİ: suppliers + supplier_orders + order_items + products + price_snapshots
│   ├── 20260516_____02_updated_at_trigger.sql                   # YENİ: set_updated_at() + 5 tabloya bind
│   ├── 20260516_____03_rls_policies.sql                         # YENİ: RLS enable + 5 tabloya policy
│   ├── 20260516_____04_record_price_observation.sql             # YENİ: PL/pgSQL fonksiyon (idempotent snapshot)
│   └── 20260516_____05_seed_enderyapi.sql                       # YENİ: seed supplier
└── seed.sql                                                      # (opsiyonel — local dev için aynı içerik)

lib/
└── supabase/
    ├── client.ts                # mevcut
    ├── server.ts                # mevcut
    ├── middleware.ts            # mevcut
    └── database.types.ts        # YENİ: generate_typescript_types çıktısı

scripts/
└── supabase/
    └── generate-types.ts        # YENİ (opsiyonel): MCP yerine CLI ile re-gen (gelecek 005+ için)
```

**Structure Decision**: Mevcut `supabase/migrations/` yapısı korunur (Constitution → Stack altında zaten kararlaştırılmış). Bu feature `lib/supabase/database.types.ts` ekleyerek frontend/scraper kodunun typed Supabase istemcisi kullanmasını mümkün kılar. UI ve scraper modülleri bu feature'da yer almaz; sonraki feature'lara (004 scraper, 006 dashboard) bırakılır.

## Complexity Tracking

> Constitution Check'te bilinçli sapma yok — tablo boş bırakılır.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
