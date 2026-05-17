# Phase 1 — Data Model: Otomatik scrape pipeline

**Feature**: 007-scrape-automation
**Date**: 2026-05-17

## Genel Bakış

Bu feature **1 yeni tablo** + **1 mevcut tabloya kolon ekleme** içerir:

1. **`public.scrape_schedule`** (YENİ) — tedarikçi başına otomatik scrape ayarı
2. **`public.scrape_runs`** (mevcut, MOD) — `trigger_type` kolonu eklenir

Mevcut `suppliers` ve `scrape_runs` tabloları korunur, yapısal değişiklik yok (sadece kolon ekleme).

---

## 1) `public.scrape_schedule` (YENİ)

### Amaç

Her tedarikçi için otomatik scrape ayarını (aktif mi, hangi saatte) saklar. Cron workflow her tetiklendiğinde bu tabloyu okur ve karar verir.

### Şema

| Kolon | Tip | NULL? | Default | Açıklama |
|-------|-----|-------|---------|----------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | PRIMARY KEY |
| `supplier_id` | `uuid` | NOT NULL | — | FK → `suppliers.id` ON DELETE CASCADE; **UNIQUE** (1 satır/tedarikçi) |
| `enabled` | `boolean` | NOT NULL | `false` | Otomatik tetikleme aktif mi |
| `daily_hour_utc` | `smallint` | NOT NULL | `9` | 0-23 arası saat (UTC); CHECK |
| `last_auto_run_at` | `timestamptz` | NULL | — | Son otomatik tetikleme zamanı (audit) |
| `last_auto_run_status` | `text` | NULL | — | Son otomatik koşumun status'u (cache; gerçek kaynak `scrape_runs`) |
| `created_at` | `timestamptz` | NOT NULL | `now()` | — |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | `set_updated_at` trigger ile otomatik |

### Constraints

```sql
CONSTRAINT scrape_schedule_supplier_unique UNIQUE (supplier_id)
CONSTRAINT scrape_schedule_hour_range CHECK (daily_hour_utc >= 0 AND daily_hour_utc <= 23)
CONSTRAINT scrape_schedule_status_valid CHECK (
  last_auto_run_status IS NULL OR last_auto_run_status IN ('success','partial','failed','aborted')
)
```

### Indexes

- PRIMARY KEY (id)
- UNIQUE (supplier_id) — yukarıdaki constraint zaten index oluşturur

### RLS Policies

```sql
ALTER TABLE public.scrape_schedule ENABLE ROW LEVEL SECURITY;

-- Authenticated user (single-user dashboard) okur ve günceller
CREATE POLICY scrape_schedule_authenticated_read   ON public.scrape_schedule FOR SELECT USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY scrape_schedule_authenticated_update ON public.scrape_schedule FOR UPDATE USING ((select auth.uid()) IS NOT NULL) WITH CHECK ((select auth.uid()) IS NOT NULL);

-- INSERT/DELETE service-role-only (V1'de seed migration ile 1 satır eklenir, son kullanıcı satır oluşturmaz/silmez)
-- service_role bypasses RLS by default, no policy needed
```

### Grants

```sql
GRANT SELECT, UPDATE ON public.scrape_schedule TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scrape_schedule TO service_role;
```

### Trigger

```sql
CREATE TRIGGER scrape_schedule_set_updated_at
  BEFORE UPDATE ON public.scrape_schedule
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
```

(Mevcut `set_updated_at` function 003 migration'da tanımlı.)

### Seed Data

Migration sonunda 1 satır (Enderyapı, default değerlerle):

```sql
INSERT INTO public.scrape_schedule (supplier_id, enabled, daily_hour_utc)
SELECT id, false, 9 FROM public.suppliers WHERE slug = 'enderyapi'
ON CONFLICT (supplier_id) DO NOTHING;
```

### State Transitions

- **enabled: false → true**: kullanıcı UI'dan toggle açar; `updated_at` güncellenir.
- **enabled: true → false**: kullanıcı toggle kapatır; sonraki cron hour-gating step'inde skip eder.
- **daily_hour_utc değişir**: kullanıcı dropdown'dan saat seçer; sonraki cron yeni saatte yakalar.
- **last_auto_run_at / last_auto_run_status güncellenir**: workflow tarafından scrape sonunda (service_role).

---

## 2) `public.scrape_runs` (mevcut, MOD)

### Değişiklik

Yeni kolon eklenir:

| Kolon | Tip | NULL? | Default | Açıklama |
|-------|-----|-------|---------|----------|
| `trigger_type` | `text` | NOT NULL | `'unknown'` | `'auto' \| 'manual' \| 'unknown'` |

```sql
ALTER TABLE public.scrape_runs
  ADD COLUMN trigger_type text NOT NULL DEFAULT 'unknown';

ALTER TABLE public.scrape_runs
  ADD CONSTRAINT scrape_runs_trigger_type_valid
  CHECK (trigger_type IN ('auto','manual','unknown'));
```

### Niye `unknown` default?

Mevcut scrape_runs satırları (006 sırasında oluşmuş ~5 koşum) için `'manual'` veya `'auto'` atayamayız (tarihsel veri); `'unknown'` ile geriye uyum sağlanır. Yeni koşumlar workflow tarafından `'auto'` veya `'manual'` ile INSERT edilir.

### Backfill (opsiyonel, V1'de yapılmaz)

Migration'da backfill yok; eski satırlar `'unknown'` kalır. Settings UI'da `trigger_type` rozeti yalnızca yeni koşumlardan itibaren anlamlı.

---

## Entity ilişki diyagramı

```text
suppliers (mevcut)
  └─ 1 ────── 1 ─→ scrape_schedule (YENİ; UNIQUE supplier_id)
  └─ 1 ────── N ─→ scrape_runs (mevcut; trigger_type kolonu eklenir)
       └─ N ─── 1 ─→ status: running/success/partial/failed/aborted
       └─ N ─── 1 ─→ trigger_type: auto/manual/unknown
```

---

## Validation Rules (FR'ları ile eşleşme)

| FR | Validation |
|----|------------|
| FR-006 (otomatik scrape tetikleme) | `scrape_schedule.enabled = true` AND `daily_hour_utc = EXTRACT(HOUR FROM now() AT TIME ZONE 'UTC')` workflow hour-gating step'inde |
| FR-007 (kapalı tedarikçi tetiklenmez) | `enabled = false` → workflow check skip eder |
| FR-008 (sonraki scrape özet UI'da) | UI Server Component `scrape_schedule` + tahmin: `if(enabled) next_run = next_occurrence_of(daily_hour_utc UTC)` |
| FR-011 (tek concurrent run) | DB layer: `EXISTS(SELECT 1 FROM scrape_runs WHERE supplier_id=$1 AND status='running' AND started_at > now() - interval '10 min')` |
| FR-012 (koşum kayıt alanları) | `scrape_runs` mevcut yapısı zaten karşılıyor; `trigger_type` ekleme tamamlar |
| FR-014 (hata detayı) | `scrape_runs.summary.errors[]` mevcut JSONB; her error: `{ step, mode, detail, timestamp }` |
| FR-015/16/17 (credentials) | DB seviyesinde değil; **migration text'inde credential YOK** (Servis role key dahi `.sql`'e gömülü değil — Supabase MCP API ile uygulanır) |

---

## Migration sırası

1. `20260517XXXXXX_scrape_schedule_table.sql` — yeni tablo + RLS + grants + seed
2. `20260517XXXXXX_scrape_runs_trigger_type.sql` — `ALTER TABLE` + CHECK

Sıralama önemli **değil** (bağımsız), ama numara ile sıralanır. (X'ler `mcp__supabase__apply_migration` çağrı sırasında zaman damgasıyla doldurulur.)

---

## TypeScript types

`mcp__supabase__generate_typescript_types` ile `lib/supabase/database.types.ts` regenerate edilir. Migration sonrası:

```ts
// Otomatik üretilir
Database["public"]["Tables"]["scrape_schedule"]["Row"] = {
  id: string;
  supplier_id: string;
  enabled: boolean;
  daily_hour_utc: number;
  last_auto_run_at: string | null;
  last_auto_run_status: 'success' | 'partial' | 'failed' | 'aborted' | null;
  created_at: string;
  updated_at: string;
}
Database["public"]["Tables"]["scrape_runs"]["Row"]["trigger_type"] = 'auto' | 'manual' | 'unknown';
```
